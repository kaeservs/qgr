// What the page asking is told (AI video, or Settings and the studio for a
// picture): the price, and the credits left on the team's Higgsfield plan
// when it was read (null when Higgsfield did not say).
const price = $('Read the price').first().json;
const balance = creditsOf({ credits: answerOf($input.first().json).credits });
return [{ json: Object.assign({}, price, { balance: balance }) }];
