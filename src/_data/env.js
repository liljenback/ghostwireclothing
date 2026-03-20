require("dotenv").config();

module.exports = {
  edgeConfigId: process.env.EDGE_CONFIG_ID_WITH_ANALYTICS || "",
  orgId: process.env.ORGANIZATION_ID || "",
  demoDecisionScopeName: process.env.demoDecisionScopeName || "",
};
