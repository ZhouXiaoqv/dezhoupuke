const { httpServer } = require('../../server');
httpServer.once('listening', () => process.send(httpServer.address().port));
process.on('disconnect', () => process.exit());
