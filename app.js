const axios = require('axios');
const _ = require('lodash');
const moment = require('moment');
const { ethers } = require('ethers');
const tweet = require('./tweet');

let lastSaleTimestamp = moment().startOf('minute').subtract(60, "seconds").utc();

function formatAndSendTweet(twitterData) {
    const formattedTokenPrice = ethers.utils.formatEther(twitterData.totalPrice.toString());
    const formattedUsdPrice = (formattedTokenPrice * twitterData.usdValue).toFixed(2);
    const formattedPriceSymbol = (
        (twitterData.tokenSymbol === 'WETH' || twitterData.tokenSymbol === 'ETH') 
            ? 'Ξ' 
            : ` ${twitterData.tokenSymbol}`
    );

    const tweetText = `Atom ⚛️ ${twitterData.tokenName} was purchased for ${formattedTokenPrice}${formattedPriceSymbol} ($${formattedUsdPrice}) by ${twitterData.buyersAddressShort} from ${twitterData.sellersAddressShort}. #${process.env.OPENSEA_COLLECTION_SLUG} #pownft #ethereum #nfts ${twitterData.openseaLink}`;
    
    console.log('tweet text', tweetText);

    return tweet.handleDupesAndTweet(twitterData.tokenName, tweetText, twitterData.image);
}

async function getLastestSaleData(collection) {
    let postData = {
        "id": "EventHistoryQuery",
        "query": "query EventHistoryQuery(  $archetype: ArchetypeInputType  $bundle: BundleSlug  $collections: [CollectionSlug!]  $categories: [CollectionSlug!]  $chains: [ChainScalar!]  $eventTypes: [EventType!]  $cursor: String  $count: Int = 10  $showAll: Boolean = false  $identity: IdentityInputType) {  ...EventHistory_data_L1XK6}fragment AccountLink_data on AccountType {  address  user {    publicUsername    id  }  ...ProfileImage_data  ...wallet_accountKey  ...accounts_url}fragment AssetCell_asset on AssetType {  collection {    name    id  }  name  ...asset_url}fragment AssetQuantity_data on AssetQuantityType {  asset {    ...Price_data    id  }  quantity}fragment EventHistory_data_L1XK6 on Query {  assetEvents(after: $cursor, bundle: $bundle, archetype: $archetype, first: $count, categories: $categories, collections: $collections, chains: $chains, eventTypes: $eventTypes, identity: $identity, includeHidden: true) {    edges {      node {        assetQuantity {          asset @include(if: $showAll) {            ...AssetCell_asset            id          }          id        }        eventTimestamp        eventType        offerEnteredClosedAt        customEventName        price {          quantity          ...AssetQuantity_data          id        }        endingPrice {          quantity          ...AssetQuantity_data          id        }        seller {          ...AccountLink_data          id        }        winnerAccount {          ...AccountLink_data          id        }        id        __typename      }      cursor    }    pageInfo {      endCursor      hasNextPage    }  }}fragment Price_data on AssetType {  decimals  imageUrl  symbol  usdSpotPrice  assetContract {    blockExplorerLink    account {      chain {        identifier        id      }      id    }    id  }}fragment ProfileImage_data on AccountType {  imageUrl  address  chain {    identifier    id  }}fragment accounts_url on AccountType {  address  chain {    identifier    id  }  user {    publicUsername    id  }}fragment asset_url on AssetType {  assetContract { address  id  }  tokenId imageUrl traits(first: 100) {        edges {          node {            relayId            displayType            floatValue            intValue            traitType            value            id          }        }      }}fragment wallet_accountKey on AccountType {  address  chain {    identifier    id  }}",
        "variables": {
            "eventTypes": ["AUCTION_SUCCESSFUL"],
            "cursor": null,
            "count": 100,
            "showAll": true,
            "collections": [
                collection
            ],
            "includeHiddenCollections": false,
            "showContextMenu": false,
            "shouldShowQuantity": false,
            "sortAscending": false,
            "sortBy": "LAST_SALE_DATE"
        }
    }
    let res = await axios.post('https://api.opensea.io/graphql', postData, {
        headers: {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/75.0.3770.100 Safari/537.36'}
    });
    return res.data
}

function buildDataForTwitter(sale) {
    return {
        tokenName: sale.node.assetQuantity.asset.name,
        image: sale.node.assetQuantity.asset.imageUrl,
        openseaLink: `https://opensea.io/assets/${sale.node.assetQuantity.asset.assetContract.address}/${sale.node.assetQuantity.asset.tokenId}`,
        totalPrice: sale.node.price.quantity,
        usdValue: sale.node.price.asset.usdSpotPrice,
        tokenSymbol: sale.node.price.asset.symbol,
        sellersAddress: sale.node.seller.address,
        buyersAddress: sale.node.winnerAccount.address,
        sellersAddressShort: sale.node.seller.address.substring(0,8),
        buyersAddressShort: sale.node.winnerAccount.address.substring(0,8)
    }
}

function isNewSaleSinceLastSale(sale) {
    let salesTimestamp = moment.utc(sale.node.eventTimestamp, 'YYYY-MM-DDThh:mm:ss')
    let diff = lastSaleTimestamp.diff(salesTimestamp, 'seconds');
    return (diff < 0);
}

function setTempLastSaleTimestamp(tempLastSaleTimestamp, sale) {
    if(tempLastSaleTimestamp == null) {
        tempLastSaleTimestamp = moment.utc(sale.node.eventTimestamp, 'YYYY-MM-DDThh:mm:ss')
    }
    return tempLastSaleTimestamp;
}

function processAllSales(latestSalesData) {
    let sendTwitterData = [];
    let tempLastSaleTimestamp = null;
    const sales = latestSalesData.data.assetEvents.edges;
    for(let index in sales) {
        let sale = sales[index];
        if(isNewSaleSinceLastSale(sale)) {
            if (sale.node.assetQuantity) {
                tempLastSaleTimestamp = setTempLastSaleTimestamp(tempLastSaleTimestamp, sale);
                twitterData = buildDataForTwitter(sale);
                formatAndSendTweet(twitterData);
                sendTwitterData.push(twitterData);
            }
        } else {
            if(tempLastSaleTimestamp != null) {
                lastSaleTimestamp = tempLastSaleTimestamp;
            }
            break
        }
    }
    console.log(`${sendTwitterData.length} sales in the last minute...`)
    return sendTwitterData;
}

async function pollOpenSeaForSales() {
    try {
        processAllSales(await getLastestSaleData(process.env.OPENSEA_COLLECTION_SLUG));
    } catch(error) {
        console.log(error);
    }
}

// Poll OpenSea every minute & retrieve all sales for a given collection in the last minute
// Then pass those events over to the formatter before tweeting
pollOpenSeaForSales();
setInterval(async () => {
    pollOpenSeaForSales();
}, 300000);
