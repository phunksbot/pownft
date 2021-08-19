const axios = require('axios');
const twit = require('twit');
const moment = require('moment');
const _ = require('lodash');
const { spawn } = require('child_process');
const sharp = require('sharp');

const twitterConfig = {
    consumer_key: process.env.CONSUMER_KEY,
    consumer_secret: process.env.CONSUMER_SECRET,
    access_token: process.env.ACCESS_TOKEN_KEY,
    access_token_secret: process.env.ACCESS_TOKEN_SECRET,
};

const twitterClient = new twit(twitterConfig);

// OpenSea doesn't give us access to Webhooks; need to poll every 60 seconds
// Occasionaly in the split second of delay, dupelicates are retrieved - filter them out here
async function handleDupesAndTweet(tokenName, tweetText, imageUrl) {
    // Search our twitter account's recent tweets for anything exactly matching our new tweet's text
    twitterClient.get('search/tweets', { q: tokenName, count: 1, result_type: 'recent' }, (error, data, response) => {
        if (!error) {
            const statuses = _.get(data, 'statuses');

            // No duplicate statuses found
            if (_.isEmpty(data) || _.isEmpty(statuses)) {
                console.log('No duplicate statuses found, continuing to tweet...');

                return tweet(tweetText, imageUrl);
            }

            const mostRecentMatchingTweetCreatedAt = _.get(statuses[0], 'created_at');
            const statusOlderThan10Mins = moment(mostRecentMatchingTweetCreatedAt).isBefore(moment().subtract(10, 'minutes'));

            // Status found is older than 10 minutes, not a cached transaction, just sold at same price
            if (statusOlderThan10Mins) {
                console.log('Previous status is older than 10 minutes, continuing to tweet...');

                return tweet(tweetText, imageUrl);
            }

            console.error('Tweet is a duplicate; possible delayed transaction retrieved from OpenSea');
        } else {
            console.error("handleDupesAndTweetsError");
            console.error(err);
        }
    });
}

// Upload image of item retrieved from OpenSea & then tweet that image + provided text
async function tweet(tweetText, imageUrl) {  
    //Convert url into buffer, then png, then base 64
    const imageArrayBuffer = await getBuffer(imageUrl); 
    let imagePNGArrayBuffer = "";
    await sharp(imageArrayBuffer)
        .toFormat('png')
        .toBuffer()
        .then(data => { imagePNGArrayBuffer = data })
        .catch(err => { console.log("Sharp error: " + err) });
    const processedImage = arrayBufferToBase64(imagePNGArrayBuffer);
                       
    twitterClient.post('media/upload', { media_data: processedImage }, (error, media, response) => {
        if (!error) {
            console.log("Tweet is valid");
            const tweet = {
                status: tweetText,
                media_ids: [media.media_id_string]
            };

            
            twitterClient.post('statuses/update', tweet, (error, tweet, response) => {
                if (!error) {
                    console.log(`Successfully tweeted: ${tweetText}`);
                } else {
                    console.error("TweetError");
                    console.error(error);
                }
            });
        } else {
            console.error("TweetError");
            console.error(error);
        }
    });
}

// Format a provided URL into it's base64 representation
function getBuffer(url) {
    return axios.get(url, { responseType: 'arraybuffer'}).then(response => Buffer.from(response.data, 'binary'))
}

//Converts array buffer into base64
function arrayBufferToBase64(arrayBuffer) {
  var base64    = ''
  var encodings = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

  var bytes         = new Uint8Array(arrayBuffer)
  var byteLength    = bytes.byteLength
  var byteRemainder = byteLength % 3
  var mainLength    = byteLength - byteRemainder

  var a, b, c, d
  var chunk

  // Main loop deals with bytes in chunks of 3
  for (var i = 0; i < mainLength; i = i + 3) {
    // Combine the three bytes into a single integer
    chunk = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2]

    // Use bitmasks to extract 6-bit segments from the triplet
    a = (chunk & 16515072) >> 18 // 16515072 = (2^6 - 1) << 18
    b = (chunk & 258048)   >> 12 // 258048   = (2^6 - 1) << 12
    c = (chunk & 4032)     >>  6 // 4032     = (2^6 - 1) << 6
    d = chunk & 63               // 63       = 2^6 - 1

    // Convert the raw binary segments to the appropriate ASCII encoding
    base64 += encodings[a] + encodings[b] + encodings[c] + encodings[d]
  }

  // Deal with the remaining bytes and padding
  if (byteRemainder == 1) {
    chunk = bytes[mainLength]

    a = (chunk & 252) >> 2 // 252 = (2^6 - 1) << 2

    // Set the 4 least significant bits to zero
    b = (chunk & 3)   << 4 // 3   = 2^2 - 1

    base64 += encodings[a] + encodings[b] + '=='
  } else if (byteRemainder == 2) {
    chunk = (bytes[mainLength] << 8) | bytes[mainLength + 1]

    a = (chunk & 64512) >> 10 // 64512 = (2^6 - 1) << 10
    b = (chunk & 1008)  >>  4 // 1008  = (2^6 - 1) << 4

    // Set the 2 least significant bits to zero
    c = (chunk & 15)    <<  2 // 15    = 2^4 - 1

    base64 += encodings[a] + encodings[b] + encodings[c] + '='
  } 
  return base64
}

module.exports = {
    handleDupesAndTweet: handleDupesAndTweet
};
