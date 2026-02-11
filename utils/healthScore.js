/**
 * Project Health Score Calculator (Backend Version)
 */

const HEALTH_WEIGHTS = {
    INACTIVITY: 2,
    ETA_OVERRUN: 30,
    STAGNATION: 15,
    PARALLEL_OVERLOAD: 10
};

const THRESHOLDS = {
    INACTIVITY_DAYS: 7,
    MAX_PARALLEL: 3,
    CRITICAL_SCORE: 60,
    WARNING_SCORE: 80
};

function calculateHealthScore(project, milestones = [], weights = HEALTH_WEIGHTS, thresholds = THRESHOLDS) {
    let score = 100;
    const activeThresholds = { ...THRESHOLDS, ...thresholds };

    // 1. INACTIVITY PENALTY
    const lastUpdate = new Date(project.last_action_at || project.updated_at || project.created_at || new Date());
    const days = Math.floor((new Date() - lastUpdate) / (1000 * 60 * 60 * 24));

    if (days > activeThresholds.INACTIVITY_DAYS) {
        const overdueDays = days - activeThresholds.INACTIVITY_DAYS;
        score -= (overdueDays * weights.INACTIVITY);
    }

    // 2. ETA OVERRUN PENALTY
    if (project.eta) {
        const etaDate = new Date(project.eta);
        const now = new Date();
        if (now > etaDate && project.status !== 'Done') {
            score -= weights.ETA_OVERRUN;
        }
    }

    // 3. MILESTONE ANALYSIS
    if (milestones && Array.isArray(milestones)) {
        const activeMilestones = milestones.filter(m => m.status === 'In Progress');
        const completedMilestones = milestones.filter(m => m.status === 'Done');

        if (activeMilestones.length > thresholds.MAX_PARALLEL) {
            score -= (activeMilestones.length - thresholds.MAX_PARALLEL) * weights.PARALLEL_OVERLOAD;
        }

        if (days > thresholds.INACTIVITY_DAYS && activeMilestones.length > 0) {
            score -= weights.STAGNATION;
        }

        if (milestones.length > 0) {
            const completionRate = completedMilestones.length / milestones.length;
            if (completionRate > 0.8) score += 5;
        }
    }

    return Math.max(0, Math.min(100, Math.round(score)));
}

module.exports = { calculateHealthScore, HEALTH_WEIGHTS };
