/**
 * Tools Index
 * Auto-exports all tools for the registry to discover
 */

const fileRead = require('./file-read');
const fileWrite = require('./file-write');
const search = require('./search');
const shell = require('./shell');
const git = require('./git');
const planning = require('./planning');
const utility = require('./utility');
const memory = require('./memory');
const filesApi = require('./files-api');
const pageindex = require('./pageindex');
const codeExecution = require('./code-execution');
const toolSearch = require('./tool-search');

module.exports = {
  ...fileRead,
  ...fileWrite,
  ...search,
  ...shell,
  ...git,
  ...planning,
  ...utility,
  ...memory,
  ...filesApi,
  ...pageindex,
  ...codeExecution,
  ...toolSearch
};
