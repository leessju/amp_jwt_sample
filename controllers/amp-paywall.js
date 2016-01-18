/**
 * Copyright 2015 The AMP HTML Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
"use strict";

var express = require('express');
var router = express.Router();

var PaywallAccess = require('../models/paywall-access');
var User = require('../models/user');

/** 
 # Authorization is configured via authorization property in the AMP Access 
 # Configuration section. It is a credentialed CORS endpoint. 
 # 
 # This endpoint produces the authorization response that can be used in the 
 # content markup expressions to show/hide different parts of content.
 */
router.get('/amp-authorization.json', function(req, res) {
  var readerId = req.query.rid;
  if (!readerId) {
    res.sendStatus(400);
    return;
  }
  var viewedUrl = req.query.url;
  var referrer = req.query.ref;

  var paywallAccess = PaywallAccess.getOrCreate(readerId);
  matchUserToReaderId(req, paywallAccess);

  var response;
  if (paywallAccess.isSubscriber()) {
    // Subscriber.
    response = {
      'subscriber': true,
      'access': true
    };
  } else if (paywallAccess.hasAlreadyVisisted(viewedUrl)) {
    // User has seen the article already
    response = {
      'return': true,
      'access': true
    };
  } else if (paywallAccess.isFirstClickFree(referrer)) {
    // First-Click is free
    response = {
      'fcs': true,
      'access': true
    };
  } else {
    // Metered.
    var hasAccess = paywallAccess.hasAccess(referrer, viewedUrl);
    // Count view if user hasn't already seen the url.
    var views = paywallAccess.numViews;
    if (hasAccess && !paywallAccess.hasAlreadyVisisted()) {
      views++;
    }
    response = {
      'views': views,
      'maxViews': PaywallAccess.MAX_VIEWS,
      'access': hasAccess
    };
  }
  console.log('Authorization response:', readerId, response);
  res.json(response);
});

/** 
 * Pingback is configured via pingback property in the AMP Access Configuration section. 
 * It must be a credentialed CORS endpoint. Pingback must not produce a response.
 *
 * Use the pingback to:
 *
 * - count down meter when it is used.
 * - map AMP Reader ID to the user's identity via cookie.
 */
router.post('/amp-pingback', function(req, res) {
  console.log('Client access pingback');
  var readerId = req.query.rid;
  if (!readerId) {
    res.sendStatus(400);
    return;
  }

  var viewedUrl = req.query.url;

  var paywallAccess = PaywallAccess.getOrCreate(readerId);
  matchUserToReaderId(req, paywallAccess);

  var referrer = req.query.ref;
  paywallAccess.registerView(referrer, viewedUrl);

  console.log('Pingback response:', readerId, {}, paywallAccess);
  console.log("paywallAccess: " + paywallAccess.numViews);
  console.log("FCF: ", referrer, paywallAccess.viewedUrlsByReferrer[referrer]);
  res.json({});
});

/**
 * Retrieves a logged in user via cookie. If it exists it will store the
 * user with the Reader ID. This makes it possible to automatically 
 * login paywall users if they are already logged into your site. 
 */
function matchUserToReaderId(req, paywallAccess) {
  //retrieve the login cookie. 
  var email = req.cookies.email;
  var user = User.findByEmail(email);
  if (user) {
    // map Reader ID to user
    paywallAccess.user = user;
  }
}

module.exports = router;
