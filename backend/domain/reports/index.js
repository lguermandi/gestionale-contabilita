const { calculateBalances } = require('./balances');
const { generateMonthlyReport } = require('./monthlyPnl');
const { generateGestioniReport } = require('./gestioni');
const { generateTimeSeries } = require('./timeSeries');
const { generateOpenPositions } = require('./openPositions');

module.exports = {
    calculateBalances,
    generateMonthlyReport,
    generateGestioniReport,
    generateTimeSeries,
    generateOpenPositions
};
