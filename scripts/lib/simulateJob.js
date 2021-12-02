const {from} = require('rxjs');
// const get = require('lodash/get');
const {map} = require('rxjs/operators');
const axios = require('axios');

const simulateJob = (_axios = axios) => params => {
  const promise = _axios({
    method: 'POST',
    url: `${params.url}/api/job`,
    headers: {
      'Authorization': `Bearer ${params.token}`,
    },
    data: {
      runId: params.runId,
      noteWindowId: params.noteWindowId,
      storePredictions: params.storePredictions,
      updateWorkStatus: params.updateWorkStatus,
    },
  });
  const res$ = from(promise).pipe(
    map(res => res.data)
  );
  res$.subscribe(
    console.log,
    console.trace,
    console.log.bind(null, ['DONE'])
  );
};

module.exports = simulateJob;
