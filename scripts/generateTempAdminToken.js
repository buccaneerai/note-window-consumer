const optimist = require('optimist');
const prompt = require('prompt');
const jwt = require('jsonwebtoken');

const config = require('../utils/config');

const getToken = function getToken({email, secret}) {
  const token = jwt.sign(
    {
      _id: 'internaladmintmptoken',
      email,
      isAdmin: true
    },
    secret,
    {expiresIn: '1 hour'}
  );
  console.log('This token is good for 1 hour:');
  console.log(token);
  return token;
}

// You can use this to generate a temporary admin token for pbapi like so:
// yarn admintoken --secret <SECRET> --email <you>@parabricks.com
const schema = {
  properties: {
    email: {
      type: 'string',
      message: 'who is this token being issued to?',
      default: 'brian@parabricks.com',
      regex: /[a-z0-9\.\+]{3,100}\@parabricks\.com$/i
    },
    secret: {
      type: 'string',
      message: 'Secret used to sign this token',
      default: config().JWT_SECRET,
    }
  }
};

prompt.override = optimist.argv;
prompt.start();
prompt.get(schema, (err, params) => getToken(params));
