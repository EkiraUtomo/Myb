const issueBootstrap = require('./run');

module.exports = async (req, res) => issueBootstrap(req, res, { publicSlugRoute: true });
