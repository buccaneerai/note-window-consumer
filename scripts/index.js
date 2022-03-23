const path = require('path');
const dotenv = require('dotenv');
const {Command} = require('commander');

// const get = require('lodash/get');
const simulateJob = require('./lib/simulateJob');

const program = new Command();
dotenv.config({path: path.resolve(__dirname, '../.env')});

console.log('PORT', process.env.PORT);
program
  .command('simulate')
  .option('--url <url>', 'Target URL', `http://localhost:${process.env.PORT}`)
  .option('--token <token>', 'JWT token', process.env.JWT_TOKEN || '')
  .option('--note-window-id <noteWindowId>', '_id of the note window', '61a7fd44f3ab3994c246d597')
  .option('--run-id <runId>', '_id of the run', '61a7fd3df3ab3994c246d595')
  .option('--store-predictions', 'store predictions', false)
  .option('--update-work-status', 'update work status', false)
  .action(opts => simulateJob()({...opts}));

program.parse(process.argv);

