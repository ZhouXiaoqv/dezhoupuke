const path = require('node:path');

module.exports = path.resolve(process.env.POKER_DATA_DIR || path.join(__dirname, '..', 'data'));
