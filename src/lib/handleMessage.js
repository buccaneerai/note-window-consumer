const get = require('lodash/get');
const {of,zip} = require('rxjs');
const {map,mergeMap} = require('rxjs/operators');

const logger = require('@buccaneerai/logging-utils');

const validateJob = require('./validateJob');
const toPredictions = require('../operators/toPredictions');
const createTask = require('./createTask');
const fetchWordsForWindow = require('./fetchWordsForWindow');
const fetchNoteWindow = require('./fetchNoteWindow');
const storePredictions = require('./storePredictions');
const updateWorkStatus = require('./updateWorkStatus');

// LEAVING IN FOR TESTING PURPOSES
// eslint-disable-next-line
// const ORIGINAL_TEXT = "You also tell me this is the worst headache of your life. Oh yeah. Also, there's a small chance that there's something else going on, like a small bleed into your brain. So these are both very scary potentially dangerous things. Okay. So we're going to give you something for pain. We're going to send you off for a CAT scan of your brain to make sure there's no blood there or anything else. Okay. And if that's normal, I have to do a lumbar puncture and I have to take some fluid from your spine, alright? Whatever, okay. Okay."
//
// let WORDS = ORIGINAL_TEXT.split(' ');
// WORDS = WORDS.map((w) => {
//   return {text: w};
// });

// this should return an observable
const handleMessage = ({
  _fetchWordsForWindow = fetchWordsForWindow,
  _fetchNoteWindow = fetchNoteWindow,
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
      _fetchNoteWindow()({noteWindowId: m.noteWindowId})
    )),
    mergeMap(([m, words, noteWindow]) => zip(
      of(m),
      _toPredictions()({message: {...m, start: noteWindow.start || 0}, words}),
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

// LEAVING IN FOR TESTING PURPOSES
// const message$ = handleMessage()({
//   runId: "6400ad16ee7ebed49afb35c7",
//   noteWindowId: "6400ad29ee7ebed49afb35c9"
// });
//
// message$.subscribe((d) => console.log(d));

module.exports = handleMessage;
