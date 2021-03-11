import * as utils from '../src/utils.js';
import {config} from '../src/config.js';
import {registerBidder} from '../src/adapters/bidderFactory.js';
import {BANNER} from '../src/mediaTypes';

const BIDDER_CODE = 'kobler';
const BIDDER_ENDPOINT = 'https://bid.essrtb.com/bid/prebid_rtb_call';
const DEFAULT_CURRENCY = 'USD';
const DEFAULT_TIMEOUT = 1000;
const TIME_TO_LIVE_IN_SECONDS = 10 * 60;

export const isBidRequestValid = function (bid) {
  return !(!bid || !bid.bidId || !bid.params || !bid.params.placementId);
};

export const buildRequests = function (validBidRequests, bidderRequest) {
  return {
    method: 'POST',
    url: BIDDER_ENDPOINT,
    data: buildOpenRtbBidRequestPayload(validBidRequests, bidderRequest),
    options: {
      contentType: 'application/json'
    }
  };
};

export const interpretResponse = function (serverResponse) {
  const res = serverResponse.body;
  const bids = []
  if (res) {
    res.seatbid.forEach(sb => {
      sb.bid.forEach(b => {
        bids.push({
          requestId: b.impid,
          cpm: b.price,
          currency: res.cur,
          width: b.w,
          height: b.h,
          creativeId: b.crid,
          dealId: b.dealid,
          netRevenue: true,
          ttl: TIME_TO_LIVE_IN_SECONDS,
          ad: b.adm,
          meta: {
            advertiserDomains: b.adomain
          }
        })
      })
    });
  }
  return bids;
};

function buildOpenRtbBidRequestPayload(validBidRequests, bidderRequest) {
  const imps = validBidRequests.map(br => buildOpenRtbImpObject(br));
  const timeout = bidderRequest.timeout || config.getConfig('bidderTimeout') || DEFAULT_TIMEOUT;
  const pageUrl = (bidderRequest.refererInfo && bidderRequest.refererInfo.referer) ?
    bidderRequest.refererInfo.referer
    : window.location.href;

  const request = {
    id: bidderRequest.auctionId,
    at: 1, // TODO: is the auction always first price?
    tmax: timeout,
    cur: [getCurrency()],
    imp: imps,
    device: {
      devicetype: getDevice(),
      geo: getGeo(validBidRequests[0])
    },
    site: {
      page: pageUrl,
    },
    test: getTest(validBidRequests[0])
  };

  return JSON.stringify(request);
}

function getCurrency() {
  return config.getConfig('currency.adServerCurrency') || DEFAULT_CURRENCY;
}

function buildOpenRtbImpObject(validBidRequest) {
  const sizes = getSizes(validBidRequest);
  const mainSize = sizes[0];
  const floorInfo = getFloorInfo(validBidRequest, mainSize);

  return {
    id: validBidRequest.bidId,
    banner: {
      format: buildFormatArray(sizes),
      w: mainSize[0],
      h: mainSize[1],
      pos: getPosition(validBidRequest)
    },
    tagid: validBidRequest.params.placementId,
    bidfloor: floorInfo.floor,
    bidfloorcur: floorInfo.currency,
    pmp: buildPmpObject(validBidRequest)
  };
}

function getDevice() {
  const ws = utils.getWindowSelf();
  const ua = ws.navigator.userAgent;

  if ((/(tablet|ipad|playbook|silk|android 3.0|xoom|sch-i800|kindle)|(android(?!.*mobi))/i)
    .test(ua.toLowerCase())) {
    return 5; // tablet
  }
  if ((/(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series([46])0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino/i
    .test(ua.toLowerCase()))) {
    return 4; // phone
  }
  return 2; // personal computers
}

function getGeo(validBidRequest) {
  if (validBidRequest.params && validBidRequest.params.zip) {
    return {
      zip: validBidRequest.params.zip
    };
  }
  return {};
}

function getTest(validBidRequest) {
  return (validBidRequest.params && validBidRequest.params.test) || config.getConfig('debug') ? 1 : 0;
}

function getSizes(validBidRequest) {
  const sizes = utils.deepAccess(validBidRequest, 'mediaTypes.banner.sizes') || validBidRequest.sizes;
  if (utils.isArray(sizes) && sizes.length > 0) {
    return sizes;
  }

  const width = validBidRequest.params.width ? validBidRequest.params.width : 0;
  const height = validBidRequest.params.height ? validBidRequest.params.height : 0;
  return [[width, height]];
}

function buildFormatArray(sizes) {
  return sizes.map(size => {
    return {
      'w': size[0],
      'h': size[1]
    };
  });
}

function getPosition(validBidRequest) {
  return parseInt(validBidRequest.params.position) || parseInt(validBidRequest.params.pos) || 0;
}

function getFloorInfo(validBidRequest, mainSize) {
  if (typeof validBidRequest.getFloor === 'function') {
    const sizeParam = mainSize[0] === 0 && mainSize === 0 ? '*' : mainSize;
    return validBidRequest.getFloor({
      currency: getCurrency(),
      mediaType: BANNER,
      size: sizeParam
    });
  } else {
    return {
      currency: getCurrency(),
      floor: validBidRequest.params.bidfloor || validBidRequest.params.floorprice || 0.0,
    };
  }
}

function buildPmpObject(validBidRequest) {
  if (validBidRequest.params.dealId) {
    return {
      deals: [
        {
          id: validBidRequest.params.dealId
        }
      ]
    };
  }
  return {};
}

export const spec = {
  code: BIDDER_CODE,
  supportedMediaTypes: [BANNER],
  isBidRequestValid,
  buildRequests,
  interpretResponse
};

registerBidder(spec);
