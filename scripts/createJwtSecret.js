const crypto = require('crypto');

crypto.randomBytes(32, function(err, buffer) {
  const token = buffer.toString('hex');
  console.log(token);
});
