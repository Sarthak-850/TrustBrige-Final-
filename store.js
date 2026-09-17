/* TrustBridge — state, persistence and the escrow state machine.
   All money here is simulated. Every mutation goes through an action that
   (1) checks the state machine, (2) moves balances, (3) writes an audit
   event, (4) notifies both parties, (5) persists. */
window.TB = window.TB || {};

TB.store = (function () {
  'use strict';
  var U = TB.utils;

  var KEY = 'trustbridge.state.v3';
  var SESSION_FLAG = 'trustbridge.session.live';
  var state = null;
  var listeners = [];

  /* =================== status model =================== */

  var S = {
    PENDING: 'pending',
    FUNDED: 'funded',
    IN_PROGRESS: 'in_progress',
    AWAITING: 'awaiting_approval',
    RELEASED: 'released',
    DISPUTED: 'disputed',
    REFUNDED: 'refunded',
    PARTIAL: 'partially_refunded',
    CANCELLED: 'cancelled'
  };

  /* Legal transitions. Anything not listed here is rejected. */
  var TRANSITIONS = {
    pending:            ['funded', 'cancelled'],
    funded:             ['in_progress', 'awaiting_approval', 'disputed'],
    in_progress:        ['awaiting_approval', 'disputed'],
    awaiting_approval:  ['released', 'disputed', 'in_progress'],
    disputed:           ['refunded', 'partially_refunded', 'released', 'awaiting_approval'],
    partially_refunded: ['partially_refunded'],
    released:           [],
    refunded:           [],
    cancelled:          []
  };

  var OPEN_DISPUTE_STATES = ['open', 'under_review', 'awaiting_response'];
  var ACTIVE_STATES = [S.FUNDED, S.IN_PROGRESS, S.AWAITING];
  var COMPLETE_STATES = [S.RELEASED, S.REFUNDED, S.PARTIAL];

  function canTransition(from, to) {
    return from === to || (TRANSITIONS[from] || []).indexOf(to) !== -1;
  }

  /* =================== persistence =================== */

  function init() {
    var raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { /* private mode */ }
    if (raw) {
      try { state = JSON.parse(raw); } catch (e) { state = null; }
    }
    if (!state || state.version !== 3) {
      state = TB.seed.build();
      persist();
    }
    /* "Remember me" off → session dies with the browser tab session */
    if (state.session && state.session.ephemeral) {
      var live = null;
      try { live = sessionStorage.getItem(SESSION_FLAG); } catch (e) {}
      if (!live) { state.session = null; persist(); }
    }
    return state;
  }

  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { /* quota / private mode — app still works in-memory */ }
  }

  function commit() {
    persist();
    listeners.forEach(function (fn) { try { fn(state); } catch (e) { console.error(e); } });
  }

  function subscribe(fn) {
    listeners.push(fn);
    return function () { listeners = listeners.filter(function (f) { return f !== fn; }); };
  }

  function resetDemo() {
    state = TB.seed.build();
    try { sessionStorage.removeItem(SESSION_FLAG); } catch (e) {}
    commit();
  }

  /* =================== selectors =================== */

  function getState() { return state; }
  function user(id) { return state.users.filter(function (u) { return u.id === id; })[0] || null; }
  function currentUser() { return state.session ? user(state.session.userId) : null; }
  function isAdmin(u) { return !!u && u.role === 'admin'; }

  function tx(id) { return state.transactions.filter(function (t) { return t.id === id; })[0] || null; }
  function dispute(id) { return state.disputes.filter(function (d) { return d.id === id; })[0] || null; }
  function disputeForTx(txId) {
    var list = state.disputes.filter(function (d) { return d.txId === txId; })
      .sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
    return list[0] || null;
  }
  function openDisputeForTx(txId) {
    return state.disputes.filter(function (d) {
      return d.txId === txId && OPEN_DISPUTE_STATES.indexOf(d.status) !== -1;
    })[0] || null;
  }

  function transactionsFor(u) {
    if (!u) return [];
    var list = isAdmin(u)
      ? state.transactions.slice()
      : state.transactions.filter(function (t) { return t.buyerId === u.id || t.sellerId === u.id; });
    return list.sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
  }

  function disputesFor(u) {
    if (!u) return [];
    var list = isAdmin(u) ? state.disputes.slice() : state.disputes.filter(function (d) {
      var t = tx(d.txId);
      return t && (t.buyerId === u.id || t.sellerId === u.id);
    });
    return list.sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
  }

  function ledgerFor(u) {
    if (!u) return [];
    return state.ledger.filter(function (l) { return l.userId === u.id; })
      .sort(function (a, b) { return new Date(b.at) - new Date(a.at); });
  }

  function notificationsFor(u) {
    if (!u) return [];
    return state.notifications.filter(function (n) { return n.userId === u.id; })
      .sort(function (a, b) { return new Date(b.at) - new Date(a.at); });
  }
  function unreadCount(u) {
    return notificationsFor(u).filter(function (n) { return !n.read; }).length;
  }

  function auditFor(u) {
    if (!u) return [];
    var list;
    if (isAdmin(u)) list = state.audit.slice();
    else {
      var mine = {};
      transactionsFor(u).forEach(function (t) { mine[t.id] = true; });
      list = state.audit.filter(function (a) { return mine[a.txId]; });
    }
    return list.sort(function (a, b) { return new Date(b.at) - new Date(a.at); });
  }

  function counterparties(u) {
    return state.users.filter(function (x) { return x.role !== 'admin' && (!u || x.id !== u.id); });
  }

  function role(t, u) {
    if (!t || !u) return 'observer';
    if (t.buyerId === u.id) return 'buyer';
    if (t.sellerId === u.id) return 'seller';
    if (isAdmin(u)) return 'admin';
    return 'observer';
  }

  function isSettled(t) {
    return t.status === S.RELEASED || t.status === S.REFUNDED || t.status === S.CANCELLED ||
      (t.status === S.PARTIAL && t.escrowBalance <= 0);
  }

  /** Approvals the signed-in user still owes, across their transactions. */
  function pendingApprovalsFor(u) {
    return transactionsFor(u).filter(function (t) {
      var r = role(t, u);
      if (r !== 'buyer' && r !== 'seller') return false;
      if (ACTIVE_STATES.indexOf(t.status) === -1) return false;
      return r === 'buyer' ? !t.buyerApproved : !t.sellerApproved;
    });
  }

  function statsFor(u) {
    var list = transactionsFor(u);
    var active = list.filter(function (t) { return ACTIVE_STATES.indexOf(t.status) !== -1; });
    var disputed = list.filter(function (t) { return t.status === S.DISPUTED; });
    var completed = list.filter(function (t) { return COMPLETE_STATES.indexOf(t.status) !== -1; });
    return {
      all: list,
      totalEscrowed: U.sum(list, function (t) { return t.escrowBalance; }),
      activeCount: active.length,
      activeValue: U.sum(active, function (t) { return t.amount; }),
      pendingApprovals: pendingApprovalsFor(u),
      disputedCount: disputed.length,
      disputedValue: U.sum(disputed, function (t) { return t.escrowBalance; }),
      completedCount: completed.length,
      completedValue: U.sum(completed, function (t) { return t.releasedAmount; }),
      refundedValue: U.sum(list, function (t) { return t.refundedAmount; }),
      byStatus: U.groupCount(list, function (t) { return t.status; })
    };
  }

  /** Monthly funded volume for the escrow-volume chart (single series). */
  function volumeSeries(u, months) {
    months = months || 6;
    var list = transactionsFor(u);
    var buckets = [], index = {};
    var d = new Date(); d.setDate(1);
    d.setMonth(d.getMonth() - (months - 1));
    for (var i = 0; i < months; i++) {
      var key = d.getFullYear() + '-' + U.pad(d.getMonth() + 1, 2);
      var b = { key: key, label: U.monthLabel(key), value: 0, count: 0 };
      buckets.push(b); index[key] = b;
      d.setMonth(d.getMonth() + 1);
    }
    list.forEach(function (t) {
      if (!t.fundedAt) return;
      var b = index[U.monthKey(t.fundedAt)];
      if (b) { b.value += t.amount; b.count++; }
    });
    return buckets;
  }

  /* =================== auth =================== */

  function login(email, password, remember) {
    var found = state.users.filter(function (u) {
      return u.email.toLowerCase() === String(email || '').trim().toLowerCase();
    })[0];
    if (!found) return { ok: false, error: 'No TrustBridge account uses that email address.' };
    if (found.password !== password) return { ok: false, error: 'That password is incorrect.' };
    state.session = { userId: found.id, at: U.now(), ephemeral: !remember };
    try {
      if (remember) sessionStorage.removeItem(SESSION_FLAG);
      else sessionStorage.setItem(SESSION_FLAG, '1');
    } catch (e) {}
    commit();
    return { ok: true, user: found };
  }

  function signup(payload) {
    var email = String(payload.email || '').trim().toLowerCase();
    if (state.users.some(function (u) { return u.email.toLowerCase() === email; })) {
      return { ok: false, error: 'An account already exists for that email address.' };
    }
    var u = {
      id: U.rid('u'),
      name: String(payload.name || '').trim(),
      email: email,
      password: payload.password,
      role: payload.role === 'seller' ? 'seller' : 'buyer',
      company: String(payload.company || '').trim(),
      phone: '', city: '',
      createdAt: U.now(),
      verified: false,
      wallet: { available: 50000, escrow: 0, pending: 0, totalReceived: 0, totalRefunded: 0, totalRefundedOut: 0 }
    };
    state.users.push(u);
    state.ledger.unshift({
      id: U.rid('lg'), userId: u.id, type: 'deposit', amount: 50000, currency: 'INR',
      txId: null, at: U.now(), note: 'Welcome balance · Simulated funds'
    });
    notify([u.id], {
      type: 'escrow_created', txId: null,
      title: 'Welcome to TrustBridge',
      body: 'Your demo wallet has been credited with ' + U.money(50000) + ' of simulated funds.'
    });
    state.session = { userId: u.id, at: U.now(), ephemeral: !payload.remember };
    try {
      if (payload.remember) sessionStorage.removeItem(SESSION_FLAG);
      else sessionStorage.setItem(SESSION_FLAG, '1');
    } catch (e) {}
    commit();
    return { ok: true, user: u };
  }

  function logout() {
    state.session = null;
    try { sessionStorage.removeItem(SESSION_FLAG); } catch (e) {}
    commit();
  }

  function resetPassword(email, newPassword) {
    var found = state.users.filter(function (u) {
      return u.email.toLowerCase() === String(email || '').trim().toLowerCase();
    })[0];
    if (!found) return { ok: false, error: 'No TrustBridge account uses that email address.' };
    found.password = newPassword;
    commit();
    return { ok: true };
  }

  function updateProfile(patch) {
    var u = currentUser();
    if (!u) return { ok: false, error: 'Not signed in.' };
    ['name', 'company', 'phone', 'city'].forEach(function (k) {
      if (patch[k] !== undefined) u[k] = String(patch[k]).trim();
    });
    commit();
    return { ok: true };
  }

  function changePassword(current, next) {
    var u = currentUser();
    if (!u) return { ok: false, error: 'Not signed in.' };
    if (u.password !== current) return { ok: false, error: 'Your current password is incorrect.' };
    u.password = next;
    commit();
    return { ok: true };
  }

  function setTheme(theme) {
    state.prefs.theme = theme;
    commit();
  }

  /* =================== internals =================== */

  function logEvent(t, action, userId, detail) {
    var ev = { id: U.rid('ac'), action: action, userId: userId, at: U.now(), detail: detail || '' };
    t.activity.push(ev);
    state.audit.unshift({ id: U.rid('au'), action: action, userId: userId, txId: t.id, at: ev.at, detail: ev.detail });
    return ev;
  }

  function notify(userIds, payload) {
    userIds.filter(Boolean).forEach(function (uid) {
      state.notifications.unshift({
        id: U.rid('nt'), userId: uid, type: payload.type, txId: payload.txId || null,
        title: payload.title, body: payload.body, at: U.now(), read: false
      });
    });
  }

  function ledgerAdd(userId, type, amount, t, note) {
    state.ledger.unshift({
      id: U.rid('lg'), userId: userId, type: type, amount: amount,
      currency: t ? t.currency : 'INR', txId: t ? t.id : null, at: U.now(), note: note
    });
  }

  function setStatus(t, next) {
    if (!canTransition(t.status, next)) {
      return { ok: false, error: 'Illegal state change: ' + U.statusLabel(t.status) + ' → ' + U.statusLabel(next) + '.' };
    }
    t.status = next;
    return { ok: true };
  }

  /* =================== permission gate =================== */

  /**
   * can(t, action, u) → { ok, reason }
   * The single source of truth for whether a button is enabled. Views never
   * decide this themselves.
   */
  function can(t, action, u) {
    if (!t || !u) return no('Not available.');
    var r = role(t, u);
    var isParty = r === 'buyer' || r === 'seller';
    var admin = isAdmin(u);
    var openDispute = openDisputeForTx(t.id);

    switch (action) {
      case 'fund':
        if (r !== 'buyer') return no('Only the buyer can fund this escrow.');
        if (t.status !== S.PENDING) return no('This escrow has already been funded.');
        if (u.wallet.available < t.amount) {
          return no('Wallet balance is short by ' + U.money(t.amount - u.wallet.available, t.currency) + '.');
        }
        return yes();

      case 'cancel':
        if (r !== 'buyer') return no('Only the buyer can cancel an unfunded escrow.');
        if (t.status !== S.PENDING) return no('Only an unfunded escrow can be cancelled.');
        return yes();

      case 'start':
        if (r !== 'seller') return no('Only the seller can start the work.');
        if (t.status !== S.FUNDED) return no('The escrow must be funded first.');
        return yes();

      case 'submit':
        if (r !== 'seller') return no('Only the seller can submit work for approval.');
        if (t.status !== S.FUNDED && t.status !== S.IN_PROGRESS) return no('Work can only be submitted on an active escrow.');
        return yes();

      case 'approve':
        if (!isParty) return no('Only the buyer or the seller can approve a release.');
        if (t.status === S.DISPUTED) return no('Approvals are locked while a dispute is open.');
        if (t.status === S.CANCELLED) return no('A cancelled escrow cannot be approved.');
        if (ACTIVE_STATES.indexOf(t.status) === -1) return no('This escrow is no longer awaiting approval.');
        if (r === 'buyer' && t.buyerApproved) return no('You have already approved this release.');
        if (r === 'seller' && t.sellerApproved) return no('You have already approved this release.');
        return yes();

      case 'withdraw_approval':
        if (!isParty) return no('Only the buyer or the seller can withdraw an approval.');
        if (ACTIVE_STATES.indexOf(t.status) === -1) return no('Approvals can no longer be changed.');
        if (r === 'buyer' && !t.buyerApproved) return no('You have not approved this release.');
        if (r === 'seller' && !t.sellerApproved) return no('You have not approved this release.');
        return yes();

      case 'release':
        if (!isParty && !admin) return no('Only a party to this escrow can release funds.');
        if (t.status === S.DISPUTED) return no('A disputed escrow cannot be released — resolve the dispute first.');
        if (openDispute) return no('Release is locked while dispute ' + openDispute.id + ' is open.');
        if (isSettled(t)) return no('These funds have already been settled.');
        if (t.escrowBalance <= 0) return no('There is nothing left in escrow to release.');
        if (!t.buyerApproved || !t.sellerApproved) {
          var who = !t.buyerApproved && !t.sellerApproved ? 'Both parties'
            : (!t.buyerApproved ? 'The buyer' : 'The seller');
          return no(who + ' must approve before funds can be released.');
        }
        return yes();

      case 'dispute':
        if (!isParty) return no('Only the buyer or the seller can raise a dispute.');
        if (ACTIVE_STATES.indexOf(t.status) === -1) {
          return no(t.status === S.DISPUTED ? 'A dispute is already open on this escrow.'
            : 'Disputes can only be raised on a funded, unsettled escrow.');
        }
        if (openDispute) return no('Dispute ' + openDispute.id + ' is already open.');
        if (t.escrowBalance <= 0) return no('There are no escrowed funds to dispute.');
        return yes();

      case 'resolve':
        if (!admin) return no('Only TrustBridge Trust & Safety can resolve a dispute.');
        if (t.status === S.DISPUTED) return yes();
        if (t.status === S.PARTIAL && t.escrowBalance > 0) return yes();
        return no('This escrow has no open resolution to action.');

      case 'respond_dispute':
        if (!isParty) return no('Only a party to the escrow can respond.');
        if (!openDispute) return no('There is no open dispute to respond to.');
        return yes();

      case 'toggle_milestone':
        if (r !== 'seller' && !admin) return no('Only the seller can update milestones.');
        if (ACTIVE_STATES.indexOf(t.status) === -1 && t.status !== S.DISPUTED) return no('Milestones are locked.');
        if (t.status === S.DISPUTED) return no('Milestones are frozen while a dispute is open.');
        return yes();

      default:
        return no('Unknown action.');
    }
    function yes() { return { ok: true, reason: '' }; }
    function no(reason) { return { ok: false, reason: reason }; }
  }

  /* =================== transaction actions =================== */

  function createTransaction(payload) {
    var u = currentUser();
    if (!u) return { ok: false, error: 'Not signed in.' };

    var amount = U.parseAmount(payload.amount);
    if (!isFinite(amount) || amount <= 0) return { ok: false, error: 'Enter an escrow amount greater than zero.' };
    if (payload.buyerId === payload.sellerId) return { ok: false, error: 'The buyer and the seller must be different people.' };
    if (!user(payload.buyerId) || !user(payload.sellerId)) return { ok: false, error: 'Select a valid buyer and seller.' };

    state.counters.tx += 1;
    var id = 'TB-' + state.counters.year + '-' + U.pad(state.counters.tx, 4);

    var t = {
      id: id,
      title: String(payload.title).trim(),
      description: String(payload.description || '').trim(),
      buyerId: payload.buyerId,
      sellerId: payload.sellerId,
      amount: amount,
      currency: payload.currency || 'INR',
      status: S.PENDING,
      paymentStatus: 'unfunded',
      createdAt: U.now(),
      expectedCompletion: payload.expectedCompletion ? new Date(payload.expectedCompletion + 'T18:00:00').toISOString() : null,
      fundedAt: null, startedAt: null, submittedAt: null, releasedAt: null, cancelledAt: null,
      buyerApproved: false, sellerApproved: false, buyerApprovedAt: null, sellerApprovedAt: null,
      escrowBalance: 0, refundedAmount: 0, releasedAmount: 0, settledAt: null,
      notes: String(payload.notes || '').trim(),
      milestones: (payload.milestones || []).filter(function (m) { return m && String(m).trim(); })
        .map(function (m, i) { return { id: id + '-m' + (i + 1), title: String(m).trim(), done: false }; }),
      disputeId: null,
      activity: []
    };
    state.transactions.unshift(t);

    logEvent(t, 'escrow_created', u.id,
      'Escrow opened for ' + U.money(t.amount, t.currency) + ' between ' +
      user(t.buyerId).name + ' (buyer) and ' + user(t.sellerId).name + ' (seller).');
    notify([t.buyerId, t.sellerId], {
      type: 'escrow_created', txId: t.id,
      title: 'Escrow created',
      body: t.title + ' — ' + U.money(t.amount, t.currency) + ' escrow opened. Awaiting funding.'
    });
    commit();
    return { ok: true, tx: t };
  }

  function fundEscrow(txId, method) {
    var u = currentUser(), t = tx(txId);
    var gate = can(t, 'fund', u);
    if (!gate.ok) return { ok: false, error: gate.reason };

    var move = setStatus(t, S.FUNDED);
    if (!move.ok) return move;

    var buyer = user(t.buyerId), seller = user(t.sellerId);
    buyer.wallet.available -= t.amount;
    buyer.wallet.escrow += t.amount;
    seller.wallet.pending += t.amount;

    t.escrowBalance = t.amount;
    t.paymentStatus = 'held_in_escrow';
    t.fundedAt = U.now();

    ledgerAdd(buyer.id, 'escrow_funding', -t.amount, t, 'Escrow funded · ' + t.title + ' · ' + (method || 'UPI'));
    logEvent(t, 'escrow_funded', u.id,
      U.money(t.amount, t.currency) + ' moved into escrow via ' + (method || 'UPI') + ' · Simulated.');
    notify([t.buyerId, t.sellerId], {
      type: 'escrow_funded', txId: t.id,
      title: 'Escrow funded',
      body: t.title + ' — ' + U.money(t.amount, t.currency) + ' is now held securely in escrow.'
    });
    commit();
    return { ok: true, tx: t };
  }

  function cancelEscrow(txId, reason) {
    var u = currentUser(), t = tx(txId);
    var gate = can(t, 'cancel', u);
    if (!gate.ok) return { ok: false, error: gate.reason };

    var move = setStatus(t, S.CANCELLED);
    if (!move.ok) return move;
    t.cancelledAt = U.now();
    t.paymentStatus = 'cancelled';
    logEvent(t, 'escrow_cancelled', u.id, 'Escrow cancelled before funding.' + (reason ? ' Reason: ' + reason : ''));
    notify([t.buyerId, t.sellerId], {
      type: 'escrow_cancelled', txId: t.id,
      title: 'Escrow cancelled', body: t.title + ' was cancelled before funding.'
    });
    commit();
    return { ok: true, tx: t };
  }

  function startWork(txId) {
    var u = currentUser(), t = tx(txId);
    var gate = can(t, 'start', u);
    if (!gate.ok) return { ok: false, error: gate.reason };
    var move = setStatus(t, S.IN_PROGRESS);
    if (!move.ok) return move;
    t.startedAt = U.now();
    logEvent(t, 'work_started', u.id, 'Seller marked the engagement as in progress.');
    notify([t.buyerId], {
      type: 'work_started', txId: t.id,
      title: 'Work in progress', body: t.title + ' — the seller has started work.'
    });
    commit();
    return { ok: true, tx: t };
  }

  function submitWork(txId, note) {
    var u = currentUser(), t = tx(txId);
    var gate = can(t, 'submit', u);
    if (!gate.ok) return { ok: false, error: gate.reason };
    var move = setStatus(t, S.AWAITING);
    if (!move.ok) return move;
    t.submittedAt = U.now();
    logEvent(t, 'work_submitted', u.id, 'Seller submitted the work for approval.' + (note ? ' Note: ' + note : ''));
    notify([t.buyerId], {
      type: 'work_submitted', txId: t.id,
      title: 'Approval requested',
      body: t.title + ' — the seller submitted the work. Review it and approve the release.'
    });
    commit();
    return { ok: true, tx: t };
  }

  function approveRelease(txId) {
    var u = currentUser(), t = tx(txId);
    var gate = can(t, 'approve', u);
    if (!gate.ok) return { ok: false, error: gate.reason };

    var r = role(t, u);
    if (r === 'buyer') { t.buyerApproved = true; t.buyerApprovedAt = U.now(); }
    else { t.sellerApproved = true; t.sellerApprovedAt = U.now(); }

    if (t.status !== S.AWAITING) setStatus(t, S.AWAITING);

    logEvent(t, 'approval_submitted', u.id, U.titleCase(r) + ' approved release of funds.');

    var other = r === 'buyer' ? t.sellerId : t.buyerId;
    if (t.buyerApproved && t.sellerApproved) {
      notify([t.buyerId, t.sellerId], {
        type: 'approval_submitted', txId: t.id,
        title: 'Both approvals received',
        body: t.title + ' — dual approval is complete. ' + U.money(t.escrowBalance, t.currency) + ' is ready to release.'
      });
    } else {
      notify([other], {
        type: 'approval_submitted', txId: t.id,
        title: U.titleCase(r) + ' approved release',
        body: t.title + ' — your approval is the last one needed before funds can be released.'
      });
    }
    commit();
    return { ok: true, tx: t, bothApproved: t.buyerApproved && t.sellerApproved };
  }

  function withdrawApproval(txId) {
    var u = currentUser(), t = tx(txId);
    var gate = can(t, 'withdraw_approval', u);
    if (!gate.ok) return { ok: false, error: gate.reason };

    var r = role(t, u);
    if (r === 'buyer') { t.buyerApproved = false; t.buyerApprovedAt = null; }
    else { t.sellerApproved = false; t.sellerApprovedAt = null; }

    logEvent(t, 'approval_withdrawn', u.id, U.titleCase(r) + ' withdrew their release approval.');
    notify([r === 'buyer' ? t.sellerId : t.buyerId], {
      type: 'approval_withdrawn', txId: t.id,
      title: U.titleCase(r) + ' withdrew approval',
      body: t.title + ' — the release is on hold again.'
    });
    commit();
    return { ok: true, tx: t };
  }

  /** Dual-approval release. Never reachable with a single approval. */
  function releaseFunds(txId) {
    var u = currentUser(), t = tx(txId);
    var gate = can(t, 'release', u);
    if (!gate.ok) return { ok: false, error: gate.reason };

    var amount = t.escrowBalance;
    var move = setStatus(t, t.refundedAmount > 0 ? S.PARTIAL : S.RELEASED);
    if (!move.ok) return move;

    var buyer = user(t.buyerId), seller = user(t.sellerId);
    buyer.wallet.escrow -= amount;
    seller.wallet.pending -= amount;
    seller.wallet.available += amount;
    seller.wallet.totalReceived += amount;

    t.escrowBalance = 0;
    t.releasedAmount += amount;
    t.releasedAt = U.now();
    t.settledAt = U.now();
    t.paymentStatus = 'settled';

    ledgerAdd(seller.id, 'escrow_release', amount, t, 'Escrow released · ' + t.title);
    logEvent(t, 'funds_released', u.id,
      U.money(amount, t.currency) + ' released to ' + seller.name + ' after dual approval.');
    notify([t.buyerId, t.sellerId], {
      type: 'funds_released', txId: t.id,
      title: 'Funds released',
      body: t.title + ' — ' + U.money(amount, t.currency) + ' released to ' + seller.name + '.'
    });
    commit();
    return { ok: true, tx: t, amount: amount };
  }

  function toggleMilestone(txId, milestoneId) {
    var u = currentUser(), t = tx(txId);
    var gate = can(t, 'toggle_milestone', u);
    if (!gate.ok) return { ok: false, error: gate.reason };
    var m = t.milestones.filter(function (x) { return x.id === milestoneId; })[0];
    if (!m) return { ok: false, error: 'Milestone not found.' };
    m.done = !m.done;
    logEvent(t, 'milestone_updated', u.id,
      'Milestone "' + m.title + '" marked ' + (m.done ? 'complete' : 'incomplete') + '.');
    commit();
    return { ok: true, milestone: m };
  }

  /* =================== disputes =================== */

  function raiseDispute(txId, payload) {
    var u = currentUser(), t = tx(txId);
    var gate = can(t, 'dispute', u);
    if (!gate.ok) return { ok: false, error: gate.reason };

    var requestedAmount = 0;
    if (payload.requestedResolution === 'partial_refund') {
      requestedAmount = U.parseAmount(payload.requestedAmount);
      if (!isFinite(requestedAmount) || requestedAmount <= 0) {
        return { ok: false, error: 'Enter the partial refund amount you are requesting.' };
      }
      if (requestedAmount > t.escrowBalance) {
        return { ok: false, error: 'A partial refund cannot exceed the escrowed balance of ' + U.money(t.escrowBalance, t.currency) + '.' };
      }
    } else if (payload.requestedResolution === 'full_refund') {
      requestedAmount = t.escrowBalance;
    }

    var move = setStatus(t, S.DISPUTED);
    if (!move.ok) return move;

    state.counters.dispute += 1;
    var d = {
      id: 'DSP-' + state.counters.dispute,
      txId: t.id,
      raisedBy: u.id,
      reason: payload.reason,
      description: String(payload.description || '').trim(),
      requestedResolution: payload.requestedResolution,
      requestedAmount: requestedAmount,
      evidence: (payload.evidence || []).map(function (f) {
        return { id: U.rid('ev'), name: f.name, size: f.size, uploadedAt: U.now() };
      }),
      status: 'open',
      createdAt: U.now(),
      updatedAt: U.now(),
      resolvedAt: null, resolvedBy: null, resolution: null,
      responses: []
    };
    state.disputes.unshift(d);
    t.disputeId = d.id;
    t.paymentStatus = 'locked_in_dispute';

    logEvent(t, 'dispute_raised', u.id,
      'Dispute ' + d.id + ' opened — ' + (TB.seed.DISPUTE_REASONS[d.reason] || d.reason) + '. Release locked.');
    notify([t.buyerId, t.sellerId, 'u_priya'], {
      type: 'dispute_raised', txId: t.id,
      title: 'Dispute opened — ' + d.id,
      body: t.title + ' — release is locked while TrustBridge reviews the dispute.'
    });
    commit();
    return { ok: true, dispute: d, tx: t };
  }

  function addDisputeResponse(disputeId, message, evidence) {
    var u = currentUser(), d = dispute(disputeId);
    if (!d) return { ok: false, error: 'Dispute not found.' };
    var t = tx(d.txId);
    var gate = can(t, 'respond_dispute', u);
    if (!gate.ok) return { ok: false, error: gate.reason };
    if (!String(message || '').trim()) return { ok: false, error: 'Write a response before submitting.' };

    d.responses = d.responses || [];
    d.responses.push({
      id: U.rid('rs'), userId: u.id, at: U.now(), message: String(message).trim(),
      evidence: (evidence || []).map(function (f) { return { id: U.rid('ev'), name: f.name, size: f.size }; })
    });
    if (d.status === 'open' || d.status === 'awaiting_response') d.status = 'under_review';
    d.updatedAt = U.now();

    logEvent(t, 'dispute_response', u.id, U.titleCase(role(t, u)) + ' responded to dispute ' + d.id + '.');
    notify([t.buyerId, t.sellerId, 'u_priya'].filter(function (x) { return x !== u.id; }), {
      type: 'dispute_raised', txId: t.id,
      title: 'New response on ' + d.id,
      body: t.title + ' — ' + u.name + ' responded to the dispute.'
    });
    commit();
    return { ok: true, dispute: d };
  }

  function setDisputeStatus(disputeId, status) {
    var u = currentUser(), d = dispute(disputeId);
    if (!d) return { ok: false, error: 'Dispute not found.' };
    if (!isAdmin(u)) return { ok: false, error: 'Only Trust & Safety can change a dispute status.' };
    d.status = status;
    d.updatedAt = U.now();
    if (status === 'closed' || status === 'resolved') {
      d.resolvedAt = d.resolvedAt || U.now();
      d.resolvedBy = u.id;
    }
    var t = tx(d.txId);
    logEvent(t, 'dispute_status_changed', u.id, 'Dispute ' + d.id + ' marked ' + U.statusLabel(status) + '.');
    notify([t.buyerId, t.sellerId], {
      type: 'dispute_raised', txId: t.id,
      title: 'Dispute ' + d.id + ' — ' + U.statusLabel(status),
      body: t.title + ' — Trust & Safety updated the dispute status.'
    });
    commit();
    return { ok: true, dispute: d };
  }

  /**
   * Admin resolution. type ∈ full_refund | partial_refund | release_remaining
   * Guards: amount > 0, amount ≤ escrowBalance, remainder never negative,
   * and a settled escrow can never be refunded twice.
   */
  function resolveDispute(disputeId, options) {
    var u = currentUser(), d = dispute(disputeId);
    if (!d) return { ok: false, error: 'Dispute not found.' };
    var t = tx(d.txId);
    var gate = can(t, 'resolve', u);
    if (!gate.ok) return { ok: false, error: gate.reason };
    if (isSettled(t)) return { ok: false, error: 'This escrow is already settled — it cannot be refunded again.' };
    if (t.escrowBalance <= 0) return { ok: false, error: 'There are no escrowed funds left to allocate.' };

    var buyer = user(t.buyerId), seller = user(t.sellerId);
    var type = options.type;
    var note = String(options.note || '').trim();
    var refund = 0;

    if (type === 'full_refund') {
      refund = t.escrowBalance;
    } else if (type === 'partial_refund') {
      refund = U.parseAmount(options.amount);
      if (!isFinite(refund) || refund <= 0) return { ok: false, error: 'The refund amount must be greater than zero.' };
      if (refund > t.escrowBalance) {
        return { ok: false, error: 'The refund cannot exceed the escrowed balance of ' + U.money(t.escrowBalance, t.currency) + '.' };
      }
      if (refund === t.escrowBalance) type = 'full_refund';
    } else if (type !== 'release_remaining') {
      return { ok: false, error: 'Choose a resolution type.' };
    }

    /* --- money movement ------------------------------------------- */
    if (refund > 0) {
      buyer.wallet.escrow -= refund;
      buyer.wallet.available += refund;
      buyer.wallet.totalRefunded += refund;
      seller.wallet.pending -= refund;
      seller.wallet.totalRefundedOut += refund;
      t.escrowBalance -= refund;
      t.refundedAmount += refund;
      ledgerAdd(buyer.id, 'refund',refund, t,
        (type === 'full_refund' ? 'Full refund' : 'Partial refund') + ' · ' + t.title + ' · ' + d.id);
    }

    var releaseAmount = 0;
    var releaseNow = type === 'release_remaining' || (options.releaseRemainder && t.escrowBalance > 0);
    if (releaseNow && t.escrowBalance > 0) {
      releaseAmount = t.escrowBalance;
      buyer.wallet.escrow -= releaseAmount;
      seller.wallet.pending -= releaseAmount;
      seller.wallet.available += releaseAmount;
      seller.wallet.totalReceived += releaseAmount;
      t.escrowBalance = 0;
      t.releasedAmount += releaseAmount;
      t.releasedAt = U.now();
      ledgerAdd(seller.id, 'escrow_release', releaseAmount, t, 'Escrow released after resolution · ' + t.title);
    }

    /* --- status --------------------------------------------------- */
    var next;
    if (t.refundedAmount > 0 && t.releasedAmount > 0) next = S.PARTIAL;
    else if (t.refundedAmount > 0 && t.refundedAmount >= t.amount) next = S.REFUNDED;
    else if (t.refundedAmount > 0) next = S.PARTIAL;
    else next = S.RELEASED;
    t.status = next;
    t.paymentStatus = t.escrowBalance > 0 ? 'held_in_escrow' : 'settled';
    if (t.escrowBalance <= 0) t.settledAt = U.now();

    /* --- dispute record ------------------------------------------- */
    d.resolution = {
      type: refund > 0 ? (type === 'full_refund' ? 'full_refund' : 'partial_refund') : 'release_remaining',
      amount: refund,
      releasedAmount: releaseAmount,
      note: note
    };
    d.status = t.escrowBalance > 0 ? 'awaiting_response' : 'resolved';
    d.resolvedAt = U.now();
    d.resolvedBy = u.id;
    d.updatedAt = U.now();

    /* --- trail ---------------------------------------------------- */
    if (refund > 0) {
      logEvent(t, type === 'full_refund' ? 'refund_processed' : 'partial_refund_processed', u.id,
        U.money(refund, t.currency) + ' refunded to ' + buyer.name + ' by Trust & Safety (' + d.id + ').' +
        (note ? ' Note: ' + note : ''));
    }
    if (releaseAmount > 0) {
      logEvent(t, 'funds_released', u.id,
        U.money(releaseAmount, t.currency) + ' remaining escrow released to ' + seller.name + ' (' + d.id + ').');
    }
    notify([t.buyerId, t.sellerId], {
      type: refund > 0 ? (type === 'full_refund' ? 'refund_processed' : 'partial_refund_processed') : 'funds_released',
      txId: t.id,
      title: 'Dispute ' + d.id + ' resolved',
      body: t.title + ' — ' +
        (refund > 0 ? U.money(refund, t.currency) + ' refunded to the buyer' : '') +
        (refund > 0 && releaseAmount > 0 ? ' and ' : '') +
        (releaseAmount > 0 ? U.money(releaseAmount, t.currency) + ' released to the seller' : '') + '.'
    });
    commit();
    return { ok: true, tx: t, dispute: d, refund: refund, released: releaseAmount };
  }

  /* =================== wallet =================== */

  function addFunds(amount, method) {
    var u = currentUser();
    if (!u) return { ok: false, error: 'Not signed in.' };
    var n = U.parseAmount(amount);
    if (!isFinite(n) || n <= 0) return { ok: false, error: 'Enter an amount greater than zero.' };
    if (n > 5000000) return { ok: false, error: 'Demo top-ups are capped at ' + U.money(5000000) + ' per transaction.' };
    u.wallet.available += n;
    ledgerAdd(u.id, 'deposit', n, null, 'Wallet top-up · ' + (method || 'UPI') + ' · Simulated');
    notify([u.id], {
      type: 'escrow_funded', txId: null,
      title: 'Funds added', body: U.money(n) + ' of simulated funds was added to your wallet.'
    });
    commit();
    return { ok: true, amount: n };
  }

  function withdraw(amount, destination) {
    var u = currentUser();
    if (!u) return { ok: false, error: 'Not signed in.' };
    var n = U.parseAmount(amount);
    if (!isFinite(n) || n <= 0) return { ok: false, error: 'Enter an amount greater than zero.' };
    if (n > u.wallet.available) {
      return { ok: false, error: 'You can withdraw at most ' + U.money(u.wallet.available) + '. Escrowed funds are locked.' };
    }
    u.wallet.available -= n;
    ledgerAdd(u.id, 'withdrawal', -n, null, 'Withdrawal to ' + (destination || 'linked bank account') + ' · Simulated');
    notify([u.id], {
      type: 'funds_released', txId: null,
      title: 'Withdrawal initiated', body: U.money(n) + ' is on its way to your linked account (simulated).'
    });
    commit();
    return { ok: true, amount: n };
  }

  /* =================== notifications =================== */

  function markRead(id, read) {
    var n = state.notifications.filter(function (x) { return x.id === id; })[0];
    if (n) { n.read = read === undefined ? true : !!read; commit(); }
  }
  function markAllRead() {
    var u = currentUser();
    if (!u) return 0;
    var count = 0;
    state.notifications.forEach(function (n) {
      if (n.userId === u.id && !n.read) { n.read = true; count++; }
    });
    commit();
    return count;
  }
  function deleteNotification(id) {
    state.notifications = state.notifications.filter(function (n) { return n.id !== id; });
    commit();
  }
  function clearReadNotifications() {
    var u = currentUser();
    if (!u) return 0;
    var before = state.notifications.length;
    state.notifications = state.notifications.filter(function (n) {
      return !(n.userId === u.id && n.read);
    });
    commit();
    return before - state.notifications.length;
  }

  /* =================== admin =================== */

  function adminStats() {
    var all = state.transactions;
    var funded = all.filter(function (t) { return !!t.fundedAt; });
    return {
      totalTransactions: all.length,
      escrowVolume: U.sum(funded, function (t) { return t.amount; }),
      heldInEscrow: U.sum(all, function (t) { return t.escrowBalance; }),
      activeDisputes: state.disputes.filter(function (d) { return OPEN_DISPUTE_STATES.indexOf(d.status) !== -1; }).length,
      refundVolume: U.sum(all, function (t) { return t.refundedAmount; }),
      releasedVolume: U.sum(all, function (t) { return t.releasedAmount; }),
      completed: all.filter(function (t) { return COMPLETE_STATES.indexOf(t.status) !== -1; }).length,
      users: state.users.length,
      byStatus: U.groupCount(all, function (t) { return t.status; })
    };
  }

  return {
    S: S, ACTIVE_STATES: ACTIVE_STATES, COMPLETE_STATES: COMPLETE_STATES,
    OPEN_DISPUTE_STATES: OPEN_DISPUTE_STATES, TRANSITIONS: TRANSITIONS,

    init: init, commit: commit, subscribe: subscribe, resetDemo: resetDemo, getState: getState,

    user: user, currentUser: currentUser, isAdmin: isAdmin, counterparties: counterparties,
    tx: tx, dispute: dispute, disputeForTx: disputeForTx, openDisputeForTx: openDisputeForTx,
    transactionsFor: transactionsFor, disputesFor: disputesFor, ledgerFor: ledgerFor,
    notificationsFor: notificationsFor, unreadCount: unreadCount, auditFor: auditFor,
    role: role, isSettled: isSettled, statsFor: statsFor, pendingApprovalsFor: pendingApprovalsFor,
    volumeSeries: volumeSeries, adminStats: adminStats, can: can,

    login: login, signup: signup, logout: logout, resetPassword: resetPassword,
    updateProfile: updateProfile, changePassword: changePassword, setTheme: setTheme,

    createTransaction: createTransaction, fundEscrow: fundEscrow, cancelEscrow: cancelEscrow,
    startWork: startWork, submitWork: submitWork, approveRelease: approveRelease,
    withdrawApproval: withdrawApproval, releaseFunds: releaseFunds, toggleMilestone: toggleMilestone,

    raiseDispute: raiseDispute, addDisputeResponse: addDisputeResponse,
    setDisputeStatus: setDisputeStatus, resolveDispute: resolveDispute,

    addFunds: addFunds, withdraw: withdraw,

    markRead: markRead, markAllRead: markAllRead,
    deleteNotification: deleteNotification, clearReadNotifications: clearReadNotifications
  };
})();
