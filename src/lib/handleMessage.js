const get = require('lodash/get');
const {of,zip} = require('rxjs');
const {map,mergeMap} = require('rxjs/operators');

const logger = require('@buccaneerai/logging-utils');

const validateJob = require('./validateJob');
const toPredictions = require('../operators/toPredictions');
const createTask = require('./createTask');
const fetchWordsForWindow = require('./fetchWordsForWindow');
const storePredictions = require('./storePredictions');
const updateWorkStatus = require('./updateWorkStatus');

// eslint-disable-next-line
const ORIGINAL_TEXT = "Hi, My name is Dr. Feelgood what is your name?  Briar Hayfield. \
What brings you in today? I have a severe headache, a migraine and an earache in my left ear \
I have pain in the back of my head and sometimes I also feel nauseous when I stand up too quick. \
Okay, do you feel dizzy? No I haven't been dizzy \
Okay, I think you may have an acute migrain and should take Tylenol and get some sleep."

let WORDS = ORIGINAL_TEXT.split(' ');
WORDS = WORDS.map((w) => {
  return {text: w};
});

// this should return an observable
const handleMessage = ({
  _fetchWordsForWindow = fetchWordsForWindow,
  // _getPatternMatchingPredictions = getPatternMatchingPredictions,
  _updateWorkStatus = updateWorkStatus,
  _toPredictions = toPredictions,
  _createTask = createTask,
  _storePredictions = storePredictions,
  _validateJob = validateJob,
  _logger = logger
} = {}) => message => {
  const shouldUpdateWorkStatus = get(message, 'updateWorkStatus', true);
  const shouldStorePredictions = get(message, 'storePredictions', true);
  const shouldCreateTask = get(message, 'shouldCreateTask', true);
  _logger.info('handlingMessage', {
    message,
    shouldUpdateWorkStatus,
    shouldStorePredictions,
    shouldCreateTask
  });
  const done$ = of(message).pipe(
    _logger.toLog('processingJob'),
    mergeMap(_validateJob()),
    _logger.toLog('validatedJob'),
    mergeMap(m => zip(
      of(m),
      _fetchWordsForWindow()({noteWindowId: m.noteWindowId}),
    )),
    mergeMap(([m, words]) => zip(
      of(m),
      _toPredictions()({message: m, words: WORDS}),
    )),
    _logger.toLog('createdPredictions'),
    mergeMap(([m, predictions]) => zip(
      of(m),
      of(predictions),
      shouldStorePredictions && predictions && predictions.length
      ? _storePredictions()({
        predictions: predictions.map(p => ({
          ...p,
          runId: message.runId,
          noteWindowId: message.noteWindowId,
        }))
      })
      : of(predictions),
    )),
    _logger.toLog('storedPredictions.done'),
    mergeMap(([m, predictions]) => zip(
      of(m),
      of(predictions),
      shouldUpdateWorkStatus
      ? _updateWorkStatus({
        noteWindowId: m.noteWindowId,
      })
      : of(null),
      shouldCreateTask
      ? _createTask({noteWindowId: m.noteWindowId})
      : of(null)
    )),
    _logger.toLog('completedJob'),
    map(([,predictions]) => predictions),
    _logger.trace()
  );
  return done$;
};

// const message$ = handleMessage()({
//   runId: "63ee8a0b6d8bae7c5dbfa3ef",
//   noteWindowId: "63ee8a216d8bae7c5dbfa3f1"
// });

const message$ = handleMessage()({
  runId: "63eed062e0f259133bbdd3ae",
  noteWindowId: "63eed076e0f259133bbdd3b0"
});
message$.subscribe((d) => console.log(d));

module.exports = handleMessage;
