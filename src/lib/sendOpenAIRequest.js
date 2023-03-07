const _ = require('lodash');
const {from} = require('rxjs');
const {map} = require('rxjs/operators');
const { Configuration, OpenAIApi } = require('openai');

const openai = ({apiKey = process.env.OPENAI_API_KEY}) => {
  const configuration = new Configuration({apiKey});
  return new OpenAIApi(configuration);
};

const sendOpenAIRequest = ({
  prompt,
  _openai = openai,
  model = 'text-davinci-003',
}) => {
  const promise = _openai().createCompletion({model, prompt});
  const text$ = from(promise).pipe(
    map(response => _.get(response, 'data.choices[0].text')),
    map(text => ({text}))
  );
  return text$;
};

module.exports = sendOpenAIRequest;
