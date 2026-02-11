// backend/verify_scoring.mjs
import { calculateClientHealth } from '../supabase/functions/client-health-score/scoring.js';

// Mock helpers
const daysAgo = (days) => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString();
};

const runTest = (name, client, data) => {
    console.log(`\n--- TEST: ${name} ---`);
    const { score, factors } = calculateClientHealth(client, data);
    console.log(`Score: ${score}`);
    console.log('Factors:', JSON.stringify(factors, null, 2));
    return { score, factors };
};

// ... Existing tests ... (re-including them for completeness if needed, or just appending)
// I will just rewrite the file with all tests including new ones.

// 1. Learning Phase
const newClient = { id: 'client-1', created_at: daysAgo(10), engagement_mode: 'collaborative', last_sign_in_at: daysAgo(20) };
runTest("Learning Phase", newClient, { invoices: [], projects: [], interactions: [] });

// 2. Financial Critical
const establishedClient = { id: 'client-2', created_at: daysAgo(100), engagement_mode: 'collaborative', last_sign_in_at: daysAgo(1) };
runTest("Financial Critical", establishedClient, {
    invoices: [{ id: 'inv-1', due_date: daysAgo(10), status: 'sent' }], // 10 days overdue
    projects: [], interactions: []
});

// 6. Financial Warning + Recent Payment Override
// Overdue 5 days (-15 pts). Score would be 85.
// Recent payment exists. Score should be clamped to 90.
const warningClient = { id: 'client-6', created_at: daysAgo(100), engagement_mode: 'collaborative', last_sign_in_at: daysAgo(1) };
runTest("Financial Warning + Override", warningClient, {
    invoices: [{ id: 'inv-warn', due_date: daysAgo(5), status: 'sent' }], // Warning level
    recentPayments: [{ id: 'pay-1', updated_at: daysAgo(2), status: 'paid' }], // Recent payment
    projects: [], interactions: []
});

// 7. Financial Critical + Recent Payment (No Override)
// Overdue 10 days (-40 pts). Score would be 60.
// Recent payment exists. Score should STAY 60 because logic says "unless there is a critical... invoice"
const criticalClient = { id: 'client-7', created_at: daysAgo(100), engagement_mode: 'collaborative', last_sign_in_at: daysAgo(1) };
runTest("Financial Critical + Recent Payment (No Override)", criticalClient, {
    invoices: [{ id: 'inv-crit', due_date: daysAgo(10), status: 'sent' }], // Critical
    recentPayments: [{ id: 'pay-2', updated_at: daysAgo(2), status: 'paid' }],
    projects: [], interactions: []
});
