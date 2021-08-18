const axios = require('axios');
const twit = require('twit');
const moment = require('moment');
const _ = require('lodash');

const twitterConfig = {
    consumer_key: process.env.CONSUMER_KEY,
    consumer_secret: process.env.CONSUMER_SECRET,
    access_token: process.env.ACCESS_TOKEN_KEY,
    access_token_secret: process.env.ACCESS_TOKEN_SECRET,
};

const twitterClient = new twit(twitterConfig);

// OpenSea doesn't give us access to Webhooks; need to poll every 60 seconds
// Occasionaly in the split second of delay, dupelicates are retrieved - filter them out here
async function handleDupesAndTweet(tokenName, tweetText) {
    // Search our twitter account's recent tweets for anything exactly matching our new tweet's text
    twitterClient.get('search/tweets', { q: tokenName, count: 1, result_type: 'recent' }, (error, data, response) => {
        if (!error) {
            const statuses = _.get(data, 'statuses');

            // No duplicate statuses found
            if (_.isEmpty(data) || _.isEmpty(statuses)) {
                console.log('No duplicate statuses found, continuing to tweet...');

                return tweet(tweetText);
            }

            const mostRecentMatchingTweetCreatedAt = _.get(statuses[0], 'created_at');
            const statusOlderThan10Mins = moment(mostRecentMatchingTweetCreatedAt).isBefore(moment().subtract(10, 'minutes'));

            // Status found is older than 10 minutes, not a cached transaction, just sold at same price
            if (statusOlderThan10Mins) {
                console.log('Previous status is older than 10 minutes, continuing to tweet...');

                return tweet(tweetText);
            }

            console.error('Tweet is a duplicate; possible delayed transaction retrieved from OpenSea');
        } else {
            console.error(err);
        }
    });
}
        
module.exports = {
    handleDupesAndTweet: handleDupesAndTweet
};
