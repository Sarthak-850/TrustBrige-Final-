/* TrustBridge — demo data layer.
   Everything here is simulated. Replacing `TB.seed.build()` with an API
   response of the same shape is the only change a real backend needs. */
window.TB = window.TB || {};

TB.seed = (function () {
  'use strict';
  var U = TB.utils;

  var USERS = [
    { id: 'u_aarav', name: 'Aarav Sharma',  email: 'buyer@trustbridge.app',  password: 'demo1234', role: 'buyer',
      company: 'Northwind Retail',      phone: '+91 98200 41122', city: 'Mumbai',    available: 412500, joined: -412 },
    { id: 'u_meera', name: 'Meera Iyer',   email: 'seller@trustbridge.app', password: 'demo1234', role: 'seller',
      company: 'Iyer Design Studio',    phone: '+91 90040 77315', city: 'Bengaluru', available: 268400, joined: -388 },
    { id: 'u_priya', name: 'Priya Menon',  email: 'admin@trustbridge.app',  password: 'demo1234', role: 'admin',
      company: 'TrustBridge Trust & Safety', phone: '+91 99870 10045', city: 'Pune', available: 0, joined: -520 },
    { id: 'u_rohan', name: 'Rohan Verma',  email: 'rohan@buildwave.io',     password: 'demo1234', role: 'seller',
      company: 'Buildwave Labs',        phone: '+91 98111 60934', city: 'Gurugram',  available: 191200, joined: -294 },
    { id: 'u_nisha', name: 'Nisha Kapoor', email: 'nisha@lumenmedia.in',    password: 'demo1234', role: 'buyer',
      company: 'Lumen Media',           phone: '+91 97020 55841', city: 'Delhi',     available: 356900, joined: -251 },
    { id: 'u_kabir', name: 'Kabir Nanda',  email: 'kabir@nandaexports.com', password: 'demo1234', role: 'seller',
      company: 'Nanda Exports',         phone: '+91 93400 21178', city: 'Jaipur',    available: 88750, joined: -176 }
  ];

  /* status, approvals and date offsets (in days from today) per transaction */
  var TX_SPEC = [
    { title: 'Custom Shopify storefront build', buyer: 'u_aarav', seller: 'u_meera', amount: 185000,
      status: 'awaiting_approval', buyerApproved: true, sellerApproved: false,
      d: { created: -24, funded: -23, started: -22, submitted: -3, buyerApproved: -2, due: 6 },
      desc: 'Design and build a Shopify Plus storefront with a custom product configurator, 6 templates and analytics wiring.',
      milestones: [
        { title: 'Design system + wireframes signed off', done: true },
        { title: 'Theme development complete', done: true },
        { title: 'Product configurator shipped', done: true },
        { title: 'Performance pass (LCP < 2.0s)', done: false }
      ],
      notes: 'Buyer has approved. Waiting on seller counter-approval before release.' },

    { title: 'Brand identity & style guide', buyer: 'u_nisha', seller: 'u_meera', amount: 96000,
      status: 'awaiting_approval', buyerApproved: false, sellerApproved: true,
      d: { created: -18, funded: -18, started: -17, submitted: -2, sellerApproved: -2, due: 4 },
      desc: 'Full brand identity: logo suite, typography, colour system and a 34-page brand guideline document.',
      milestones: [
        { title: 'Moodboard + 3 directions', done: true },
        { title: 'Chosen direction refined', done: true },
        { title: 'Guideline document delivered', done: true }
      ],
      notes: 'Seller has approved release and is awaiting buyer sign-off.' },

    { title: 'Warehouse inventory API integration', buyer: 'u_aarav', seller: 'u_rohan', amount: 240000,
      status: 'in_progress', buyerApproved: false, sellerApproved: false,
      d: { created: -14, funded: -13, started: -12, due: 11 },
      desc: 'Two-way sync between the ERP and the storefront: stock levels, price rules, order webhooks and a reconciliation report.',
      milestones: [
        { title: 'Sandbox connection + auth', done: true },
        { title: 'Stock + price sync', done: true },
        { title: 'Order webhooks', done: false },
        { title: 'Reconciliation report', done: false }
      ],
      notes: 'Weekly demo every Thursday.' },

    { title: 'Product photography — autumn catalogue', buyer: 'u_nisha', seller: 'u_kabir', amount: 74500,
      status: 'in_progress', buyerApproved: false, sellerApproved: false,
      d: { created: -9, funded: -9, started: -8, due: 9 },
      desc: '120 e-commerce stills plus 12 lifestyle shots, retouched and delivered in web + print resolutions.',
      milestones: [
        { title: 'Studio booking + shot list', done: true },
        { title: 'Shoot day 1 — 60 SKUs', done: true },
        { title: 'Shoot day 2 — 60 SKUs', done: false },
        { title: 'Retouch + delivery', done: false }
      ] },

    { title: 'iOS app store submission package', buyer: 'u_aarav', seller: 'u_rohan', amount: 58000,
      status: 'funded', buyerApproved: false, sellerApproved: false,
      d: { created: -5, funded: -4, due: 15 },
      desc: 'Prepare and submit the iOS build: signing, screenshots, privacy manifest, review notes and release management.',
      milestones: [
        { title: 'Provisioning + signing', done: false },
        { title: 'Store listing assets', done: false },
        { title: 'Submission + review response', done: false }
      ] },

    { title: 'Quarterly SEO retainer — Q3', buyer: 'u_nisha', seller: 'u_meera', amount: 135000,
      status: 'pending', buyerApproved: false, sellerApproved: false,
      d: { created: -2, due: 28 },
      desc: 'Technical audit, 12 content briefs, internal linking overhaul and monthly reporting for the quarter.',
      milestones: [
        { title: 'Technical audit', done: false },
        { title: 'Content briefs (12)', done: false },
        { title: 'Reporting dashboard', done: false }
      ],
      notes: 'Awaiting escrow funding from the buyer.' },

    { title: 'Packaging die-line redesign', buyer: 'u_aarav', seller: 'u_kabir', amount: 42000,
      status: 'pending', buyerApproved: false, sellerApproved: false,
      d: { created: -1, due: 21 },
      desc: 'Redraw 8 SKU die-lines for the new carton spec and supply print-ready artwork with a dieline PDF set.',
      milestones: [
        { title: 'Dieline drafts', done: false },
        { title: 'Print-ready artwork', done: false }
      ] },

    { title: 'Marketing site copywriting', buyer: 'u_aarav', seller: 'u_meera', amount: 68000,
      status: 'released', buyerApproved: true, sellerApproved: true,
      d: { created: -62, funded: -61, started: -60, submitted: -49, buyerApproved: -48, sellerApproved: -48, released: -47, due: -45 },
      desc: 'Long-form copy for 9 pages including the pricing page, plus 14 ad variants.',
      milestones: [
        { title: 'Message architecture', done: true },
        { title: 'Page copy — round 1', done: true },
        { title: 'Final copy + ad variants', done: true }
      ] },

    { title: 'Data migration — legacy CRM to HubSpot', buyer: 'u_nisha', seller: 'u_rohan', amount: 310000,
      status: 'released', buyerApproved: true, sellerApproved: true,
      d: { created: -54, funded: -53, started: -52, submitted: -34, sellerApproved: -33, buyerApproved: -32, released: -32, due: -30 },
      desc: 'Migrate 240k contacts, 38k deals and all activity history with field mapping, dedupe and a rollback snapshot.',
      milestones: [
        { title: 'Field mapping sign-off', done: true },
        { title: 'Dry run + dedupe report', done: true },
        { title: 'Production cutover', done: true },
        { title: 'Post-migration audit', done: true }
      ] },

    { title: 'Trade-show booth fabrication', buyer: 'u_aarav', seller: 'u_kabir', amount: 156000,
      status: 'released', buyerApproved: true, sellerApproved: true,
      d: { created: -40, funded: -39, started: -38, submitted: -20, buyerApproved: -19, sellerApproved: -19, released: -18, due: -16 },
      desc: '6m × 3m modular booth: fabrication, graphics, lighting rig, on-site build and teardown.',
      milestones: [
        { title: 'Structure fabrication', done: true },
        { title: 'Graphics + lighting', done: true },
        { title: 'On-site build', done: true }
      ] },

    { title: 'Explainer video production', buyer: 'u_nisha', seller: 'u_meera', amount: 128000,
      status: 'disputed', buyerApproved: false, sellerApproved: true,
      d: { created: -31, funded: -30, started: -29, submitted: -8, sellerApproved: -8, dispute: -6, due: -4 },
      desc: '90-second animated explainer: script, storyboard, illustration, animation and a licensed sound bed.',
      milestones: [
        { title: 'Script + storyboard', done: true },
        { title: 'Illustration pass', done: true },
        { title: 'Animation + sound', done: true },
        { title: 'Two revision rounds', done: false }
      ],
      dispute: {
        raisedBy: 'u_nisha', reason: 'deliverable_quality', status: 'under_review',
        description: 'The delivered cut is 62 seconds instead of the contracted 90 seconds, and the second revision round in the scope was not provided. We asked twice on 18 and 21 Aug.',
        requested: 'partial_refund', requestedAmount: 38000,
        evidence: [{ name: 'scope-of-work-signed.pdf', size: 284114 }, { name: 'delivered-cut-v2.mp4', size: 18442190 }, { name: 'email-thread.pdf', size: 96233 }]
      } },

    { title: 'Bulk textile order — 400 units', buyer: 'u_aarav', seller: 'u_kabir', amount: 264000,
      status: 'disputed', buyerApproved: false, sellerApproved: false,
      d: { created: -26, funded: -25, started: -24, submitted: -11, dispute: -9, due: -6 },
      desc: '400 units of 280 GSM cotton twill in three colourways, delivered to the Bhiwandi warehouse.',
      milestones: [
        { title: 'Sample approval', done: true },
        { title: 'Production run', done: true },
        { title: 'QC + dispatch', done: true },
        { title: 'Delivery signed off', done: false }
      ],
      dispute: {
        raisedBy: 'u_aarav', reason: 'partial_delivery', status: 'open',
        description: '318 of 400 units arrived. 82 units are missing from the third colourway and the packing list does not match the invoice.',
        requested: 'partial_refund', requestedAmount: 54120,
        evidence: [{ name: 'goods-received-note.pdf', size: 141002 }, { name: 'warehouse-count.xlsx', size: 38210 }]
      } },

    { title: 'Landing page A/B test suite', buyer: 'u_nisha', seller: 'u_rohan', amount: 88000,
      status: 'partially_refunded', buyerApproved: false, sellerApproved: false,
      refundedAmount: 26400, releasedAmount: 61600, settled: true,
      d: { created: -78, funded: -77, started: -76, submitted: -58, dispute: -56, resolved: -50, released: -50, due: -60 },
      desc: 'Six landing-page variants with an experiment harness and a statistical significance dashboard.',
      milestones: [
        { title: 'Experiment harness', done: true },
        { title: 'Variants 1–4', done: true },
        { title: 'Variants 5–6', done: false },
        { title: 'Significance dashboard', done: false }
      ],
      dispute: {
        raisedBy: 'u_nisha', reason: 'scope_not_met', status: 'resolved',
        description: 'Four of six variants were delivered and the significance dashboard was never handed over.',
        requested: 'partial_refund', requestedAmount: 29000,
        evidence: [{ name: 'delivery-checklist.pdf', size: 74221 }],
        resolution: { type: 'partial_refund', amount: 26400, note: 'Two undelivered variants and the dashboard priced at 30% of contract value. Refunded to buyer; the remainder released to the seller.' }
      } },

    { title: 'Performance ads management — Q2', buyer: 'u_nisha', seller: 'u_rohan', amount: 96000,
      status: 'partially_refunded', buyerApproved: false, sellerApproved: false,
      refundedAmount: 28800, releasedAmount: 0,
      d: { created: -44, funded: -43, started: -42, submitted: -30, dispute: -28, resolved: -22, due: -26 },
      desc: 'Google and Meta campaign management for the quarter: build, daily optimisation and weekly reporting.',
      milestones: [
        { title: 'Account audit + tracking fix', done: true },
        { title: 'Campaign build', done: true },
        { title: 'Daily optimisation (12 weeks)', done: false },
        { title: 'Weekly reporting', done: false }
      ],
      notes: 'Partial refund issued. The remaining escrow balance is still awaiting a decision on the released portion.',
      dispute: {
        raisedBy: 'u_nisha', reason: 'late_delivery', status: 'awaiting_response',
        description: 'Optimisation stopped in week 5 of 12 and reporting was delivered twice in the whole quarter.',
        requested: 'partial_refund', requestedAmount: 32000,
        evidence: [{ name: 'campaign-change-history.csv', size: 61204 }, { name: 'reporting-emails.pdf', size: 88110 }],
        resolution: { type: 'partial_refund', amount: 28800, note: 'Seven of twelve optimisation weeks unserviced — 30% of contract value refunded. Remaining balance pending the seller’s response before release.' }
      } },

    { title: 'Influencer campaign management', buyer: 'u_nisha', seller: 'u_kabir', amount: 72000,
      status: 'refunded', buyerApproved: false, sellerApproved: false,
      refundedAmount: 72000, settled: true,
      d: { created: -70, funded: -69, dispute: -64, resolved: -59, due: -46 },
      desc: 'Sourcing, contracting and managing 12 micro-influencers for a 4-week campaign.',
      milestones: [
        { title: 'Creator shortlist', done: false },
        { title: 'Contracting', done: false },
        { title: 'Campaign go-live', done: false }
      ],
      dispute: {
        raisedBy: 'u_nisha', reason: 'no_delivery', status: 'closed',
        description: 'No creator shortlist was ever delivered and the seller stopped responding after the kickoff call.',
        requested: 'full_refund', requestedAmount: 72000,
        evidence: [{ name: 'unanswered-messages.pdf', size: 52990 }],
        resolution: { type: 'full_refund', amount: 72000, note: 'No deliverables were produced and the seller did not respond within the 5-day window. Full refund issued to the buyer.' }
      } },

    { title: 'Annual audit advisory retainer', buyer: 'u_aarav', seller: 'u_rohan', amount: 120000,
      status: 'cancelled', buyerApproved: false, sellerApproved: false,
      d: { created: -35, cancelled: -33, due: -5 },
      desc: 'Advisory support for the statutory audit cycle, including reconciliation prep and auditor liaison.',
      milestones: [{ title: 'Reconciliation prep', done: false }, { title: 'Auditor liaison', done: false }],
      notes: 'Cancelled before funding — engagement moved to the incumbent firm.' },

    { title: 'Mobile design system refresh', buyer: 'u_aarav', seller: 'u_meera', amount: 148000,
      status: 'released', buyerApproved: true, sellerApproved: true,
      d: { created: -96, funded: -95, started: -94, submitted: -74, buyerApproved: -73, sellerApproved: -73, released: -72, due: -70 },
      desc: 'Rebuild the mobile component library with tokens, dark mode and accessibility annotations.',
      milestones: [
        { title: 'Token architecture', done: true },
        { title: 'Component rebuild', done: true },
        { title: 'Dark mode + a11y annotations', done: true }
      ] }
  ];

  var DISPUTE_REASONS = {
    deliverable_quality: 'Deliverable quality below agreement',
    partial_delivery: 'Partial or incomplete delivery',
    scope_not_met: 'Agreed scope not met',
    no_delivery: 'Nothing delivered',
    late_delivery: 'Delivered past the agreed date',
    not_as_described: 'Not as described',
    unauthorised_charge: 'Unauthorised or duplicate charge',
    other: 'Other'
  };

  var RESOLUTION_LABELS = {
    full_refund: 'Full refund to buyer',
    partial_refund: 'Partial refund to buyer',
    release_remaining: 'Release remaining funds to seller',
    release_full: 'Release full amount to seller'
  };

  function build() {
    var users = USERS.map(function (u) {
      return {
        id: u.id, name: u.name, email: u.email, password: u.password, role: u.role,
        company: u.company, phone: u.phone, city: u.city,
        createdAt: U.daysFromNow(u.joined, 10),
        verified: true,
        wallet: {
          available: u.available, escrow: 0, pending: 0,
          totalReceived: 0, totalRefunded: 0, totalRefundedOut: 0
        }
      };
    });
    var byId = {};
    users.forEach(function (u) { byId[u.id] = u; });

    var year = new Date().getFullYear();
    var transactions = [], disputes = [], ledger = [], audit = [], notifications = [];
    var txSeq = 0, dspSeq = 1041;

    TX_SPEC.slice().sort(function (a, b) { return a.d.created - b.d.created; }).forEach(function (spec) {
      txSeq++;
      var d = spec.d;
      var id = 'TB-' + year + '-' + U.pad(txSeq, 4);
      var at = function (off, hour) { return off === undefined ? null : U.daysFromNow(off, hour === undefined ? 11 : hour); };

      var funded = d.funded !== undefined;
      var refundedAmount = spec.refundedAmount || 0;
      var releasedAmount = spec.releasedAmount !== undefined
        ? spec.releasedAmount
        : (spec.status === 'released' ? spec.amount : 0);
      var escrowBalance = 0;
      if (funded) {
        if (spec.settled || spec.status === 'released' || spec.status === 'refunded') escrowBalance = 0;
        else escrowBalance = spec.amount - refundedAmount - releasedAmount;
      }

      var tx = {
        id: id,
        title: spec.title,
        description: spec.desc,
        buyerId: spec.buyer,
        sellerId: spec.seller,
        amount: spec.amount,
        currency: 'INR',
        status: spec.status,
        paymentStatus: funded ? (escrowBalance > 0 ? 'held_in_escrow' : 'settled') : 'unfunded',
        createdAt: at(d.created, 10),
        expectedCompletion: at(d.due, 18),
        fundedAt: at(d.funded),
        startedAt: at(d.started),
        submittedAt: at(d.submitted),
        releasedAt: at(d.released),
        cancelledAt: at(d.cancelled),
        buyerApproved: !!spec.buyerApproved,
        sellerApproved: !!spec.sellerApproved,
        buyerApprovedAt: at(d.buyerApproved),
        sellerApprovedAt: at(d.sellerApproved),
        escrowBalance: escrowBalance,
        refundedAmount: refundedAmount,
        releasedAmount: releasedAmount,
        settledAt: (spec.settled || spec.status === 'released') ? at(d.released !== undefined ? d.released : d.resolved) : null,
        notes: spec.notes || '',
        milestones: (spec.milestones || []).map(function (m, i) {
          return { id: id + '-m' + (i + 1), title: m.title, done: !!m.done };
        }),
        disputeId: null,
        activity: []
      };

      /* --- dispute ------------------------------------------------- */
      if (spec.dispute) {
        dspSeq++;
        var ds = spec.dispute;
        var dispute = {
          id: 'DSP-' + dspSeq,
          txId: id,
          raisedBy: ds.raisedBy,
          reason: ds.reason,
          description: ds.description,
          requestedResolution: ds.requested,
          requestedAmount: ds.requestedAmount || 0,
          evidence: (ds.evidence || []).map(function (f) {
            return { id: U.rid('ev'), name: f.name, size: f.size, uploadedAt: at(d.dispute) };
          }),
          status: ds.status,
          createdAt: at(d.dispute, 15),
          updatedAt: at(d.resolved !== undefined ? d.resolved : d.dispute, 15),
          resolvedAt: d.resolved !== undefined ? at(d.resolved, 16) : null,
          resolvedBy: d.resolved !== undefined ? 'u_priya' : null,
          resolution: ds.resolution || null
        };
        disputes.push(dispute);
        tx.disputeId = dispute.id;
      }

      /* --- activity (append-only audit trail) ---------------------- */
      function act(when, action, actor, detail) {
        if (!when) return;
        tx.activity.push({
          id: U.rid('ac'), action: action, userId: actor, at: when, detail: detail || ''
        });
      }
      act(tx.createdAt, 'escrow_created', tx.buyerId,
        'Escrow opened for ' + U.money(tx.amount, tx.currency) + ' with ' + byId[tx.sellerId].name + '.');
      act(tx.fundedAt, 'escrow_funded', tx.buyerId,
        U.money(tx.amount, tx.currency) + ' moved into escrow via UPI · Simulated.');
      act(tx.startedAt, 'work_started', tx.sellerId, 'Seller marked the engagement as in progress.');
      act(tx.submittedAt, 'work_submitted', tx.sellerId, 'Seller submitted the work for approval.');
      act(tx.buyerApprovedAt, 'approval_submitted', tx.buyerId, 'Buyer approved release of funds.');
      act(tx.sellerApprovedAt, 'approval_submitted', tx.sellerId, 'Seller approved release of funds.');
      if (spec.dispute) {
        act(at(d.dispute, 15), 'dispute_raised', spec.dispute.raisedBy,
          'Dispute ' + tx.disputeId + ' opened — ' + DISPUTE_REASONS[spec.dispute.reason] + '. Release locked.');
        if (d.resolved !== undefined && spec.dispute.resolution) {
          var rt = spec.dispute.resolution.type;
          act(at(d.resolved, 16), rt === 'partial_refund' ? 'partial_refund_processed' : 'refund_processed', 'u_priya',
            U.money(spec.dispute.resolution.amount, tx.currency) + ' refunded to the buyer by Trust & Safety.');
        }
      }
      if (releasedAmount > 0 && tx.releasedAt) {
        act(tx.releasedAt, 'funds_released', spec.dispute ? 'u_priya' : tx.buyerId,
          U.money(releasedAmount, tx.currency) + ' released to ' + byId[tx.sellerId].name + '.');
      }
      act(tx.cancelledAt, 'escrow_cancelled', tx.buyerId, 'Escrow cancelled before funding.');
      tx.activity.sort(function (a, b) { return new Date(a.at) - new Date(b.at); });

      /* --- wallet roll-up ----------------------------------------- */
      var buyer = byId[tx.buyerId], seller = byId[tx.sellerId];
      buyer.wallet.escrow += escrowBalance;
      seller.wallet.pending += escrowBalance;
      seller.wallet.totalReceived += releasedAmount;
      buyer.wallet.totalRefunded += refundedAmount;
      seller.wallet.totalRefundedOut += refundedAmount;

      /* --- ledger ------------------------------------------------- */
      if (tx.fundedAt) {
        ledger.push(entry(tx.buyerId, 'escrow_funding', -tx.amount, tx, tx.fundedAt, 'Escrow funded · ' + tx.title));
      }
      if (refundedAmount > 0) {
        var refundAt = at(d.resolved, 16);
        ledger.push(entry(tx.buyerId, 'refund', refundedAmount, tx, refundAt,
          (refundedAmount < tx.amount ? 'Partial refund' : 'Full refund') + ' · ' + tx.title));
      }
      if (releasedAmount > 0 && tx.releasedAt) {
        ledger.push(entry(tx.sellerId, 'escrow_release', releasedAmount, tx, tx.releasedAt, 'Escrow released · ' + tx.title));
      }

      /* --- audit -------------------------------------------------- */
      tx.activity.forEach(function (a) {
        audit.push({ id: U.rid('au'), action: a.action, userId: a.userId, txId: tx.id, at: a.at, detail: a.detail });
      });

      transactions.push(tx);
    });

    /* opening deposits + a couple of withdrawals, so the ledger reads full */
    [['u_aarav', 900000, -300], ['u_meera', 150000, -280], ['u_nisha', 780000, -240],
     ['u_rohan', 120000, -210], ['u_kabir', 90000, -160]].forEach(function (r) {
      ledger.push(entry(r[0], 'deposit', r[1], null, U.daysFromNow(r[2], 12), 'Wallet top-up · NEFT · Simulated'));
    });
    ledger.push(entry('u_meera', 'withdrawal', -240000, null, U.daysFromNow(-44, 15), 'Withdrawal to HDFC ••4417 · Simulated'));
    ledger.push(entry('u_rohan', 'withdrawal', -260000, null, U.daysFromNow(-28, 15), 'Withdrawal to ICICI ••9082 · Simulated'));
    ledger.push(entry('u_kabir', 'withdrawal', -140000, null, U.daysFromNow(-14, 15), 'Withdrawal to SBI ••2210 · Simulated'));
    ledger.sort(function (a, b) { return new Date(b.at) - new Date(a.at); });
    audit.sort(function (a, b) { return new Date(b.at) - new Date(a.at); });

    /* notifications — derived from the most recent 26 audit events */
    var NOTIF_COPY = {
      escrow_created: ['Escrow created', 'A new escrow was opened.'],
      escrow_funded: ['Escrow funded', 'Funds are now held securely in escrow.'],
      work_started: ['Work in progress', 'The seller has started the engagement.'],
      work_submitted: ['Approval requested', 'Work was submitted for your approval.'],
      approval_submitted: ['Release approved', 'One party approved the release.'],
      funds_released: ['Funds released', 'Escrowed funds were released to the seller.'],
      dispute_raised: ['Dispute opened', 'Release is locked while the dispute is reviewed.'],
      refund_processed: ['Refund processed', 'A refund was issued to the buyer.'],
      partial_refund_processed: ['Partial refund processed', 'A partial refund was issued to the buyer.'],
      escrow_cancelled: ['Escrow cancelled', 'The escrow was cancelled before funding.']
    };
    var txIndex = {};
    transactions.forEach(function (t) { txIndex[t.id] = t; });

    audit.slice(0, 26).forEach(function (a) {
      var tx = txIndex[a.txId];
      if (!tx) return;
      var copy = NOTIF_COPY[a.action] || ['Escrow update', 'Your escrow was updated.'];
      [tx.buyerId, tx.sellerId].forEach(function (uid, i) {
        notifications.push({
          id: U.rid('nt'), userId: uid, type: a.action, txId: tx.id,
          title: copy[0], body: tx.title + ' — ' + copy[1],
          at: a.at, read: U.daysBetween(a.at, new Date()) > 4 || (i === 1 && a.userId === uid)
        });
      });
    });
    notifications.sort(function (a, b) { return new Date(b.at) - new Date(a.at); });

    return {
      version: 3,
      createdAt: U.now(),
      session: null,
      users: users,
      transactions: transactions,
      disputes: disputes,
      ledger: ledger,
      audit: audit,
      notifications: notifications,
      counters: { tx: txSeq, dispute: dspSeq, year: year },
      prefs: { theme: 'dark' }
    };
  }

  function entry(userId, type, amount, tx, at, note) {
    return {
      id: U.rid('lg'), userId: userId, type: type, amount: amount,
      currency: tx ? tx.currency : 'INR', txId: tx ? tx.id : null, at: at, note: note
    };
  }

  return {
    build: build,
    DISPUTE_REASONS: DISPUTE_REASONS,
    RESOLUTION_LABELS: RESOLUTION_LABELS
  };
})();
