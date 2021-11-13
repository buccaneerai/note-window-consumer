// note: config must be loaded before any other modules!
const config = require('./lib/config'); // eslint-disable-line no-unused-vars
const app = require('./server/app');


function start() {
  if (process.env.START_SERVER === 'false') return null;
  app.start();
}

start();


