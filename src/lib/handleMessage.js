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
// LEAVING IN FOR TESTING PURPOSES
// const ORIGINAL_TEXT = "Good morning [NAME]. \
// How are you today? Not so good doctor. Sorry to hear that. \
// Hello. So tell me what brings you in today. \
// I have a really bad sore throat. It's been going on for about five days now. OK. \
// And on a scale of 1 to 10, how bad would you say your throat pain is?  \
// I would say it's about an eight. Okay. And do you any other symptoms besides your throat pain? \
// Yeah, when it started I felt a little feverish."
// No. Yeah, right before this started, my son was sick too. He also had a sore throat and was running a fever. \
// Okay, did you take him to the doctor? Do you know where he got it? Yeah, we took him. They said that he had throat. \
// Oh, okay.  Did you try to help your sore throat to make it better? Yeah, I took some ibuprofen and that helped. \
// And do you have any past medical history? [NAME]?  like diabetes, high blood pressure, asthma, any chronic conditions? \
// Yeah, I've had asthma for about 10 years now. Do you take any medicines on an everyday I take Flovent to control my asthma. \
// What's all? Allergic to any medicines that you know?  Yeah, I'm allergic to C-chlor.  Okay. Do you smoke cigarettes? \
// No. Drink No. You don't drive it off? Uh... Yeah, I have a history of cocaine abuse. Okay.  or just in the past? \
// No, about 10 years ago. Okay. And... Oh shoot. That might have it up. Watch that in the future. \
// And have you had any surgeries before in your life?  No, only on my wisdom teeth to have those removed. \
// Okay. And are you able to swallow liquids okay? Swallow own saliva? Yeah, it kind of hurts, but I can.  \
// well we're gonna, I'm gonna examine you here first, so listen to your heart and lungs, look in your throat, and then we're gonna order a...  \
// Strap throat swab for you and We get the results back of that I'll come back here and let you know that someone will \
// come in the room in a minute to do your straps  for it. Okay, sounds good. Thank you doctor. \
// All right, so your strep throat test was positive [NAME], so that's caused by a bacteria called group A streptococcus. \
// It's probably from what your son may have had as well, so that requires antibiotics. \
// So going to recommend an antibiotic for you to call them boxicillin. What happened when you took C-chloric? What kind of allergy?  \
// Yeah, I'm not really sure I was an infant when it happened. Well, a small likelihood that people that are there See Clark \
// to be allergic to a much than we were taking a moxist on before yeah  have. \
// Okay so we're give you that it'll be one pill twice a day for ten days. I also want you to drink lots of fluids, get plenty of rest.  \
// Tylenol or ibuprofen to help with the pain. And if you're still not better in three to four days, please let us know or your primary care physician. \
// If you're getting worse between now and then, such as a higher fever, vomiting, you can't swallow your own saliva, \
// can't breathe good, those are things we want you to come back and immediately for. Okay. Good for you guys."

// let WORDS = ORIGINAL_TEXT.split(' ');
// WORDS = WORDS.map((w) => {
//   return {text: w};
// });

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
      _toPredictions()({message: m, words}),
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
