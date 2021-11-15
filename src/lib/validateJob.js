const Joi = require('joi');
const {of, throwError} = require('rxjs');
const {mergeMap} = require('rxjs/operators');

const schema = Joi.object().keys({
  noteWindowId: Joi.string().alphanum().required(),
  runId: Joi.string().alphanum().required(),
  practitionerId: Joi.string().alphanum().required(),
});

const processValidationOrThrow = () => validations => (
  validations.error
  ? throwError(new Error(validations.error))
  : of(validations.value)
);

const validateJob = (
  _schema = schema,
  _processValidationOrThrow = processValidationOrThrow
) => job => {
  const validations = _schema.validate(job);
  const jobOrThrow$ = of(validations).pipe(
    mergeMap(_processValidationOrThrow())
  );
  return jobOrThrow$;
};

module.exports = validateJob;
