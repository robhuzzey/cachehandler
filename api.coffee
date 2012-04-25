private = require './private/private.js'
express = require 'express'
mongodb = require 'mongodb' 

apis = 
  "twitter":
    "host": "api.twitter.com"
    "protocol": "http"
    "port": 80
  "delicious":
    "host": "feeds.delicious.com"
    "protocol": "http"
    "port": 80
  "google":
    "host": "www.googleapis.com"
    "protocol": "https"
    "port": 443
    
class App
  init: (@params) ->
    @setConnection params.db
  
  output: (data) ->
    @params.server.response.send data

  setConnection: (db) ->
    # Set connection to app if we have one
    @_db = db.conn or false
    # Log the erro if we have one
    console.log db.err if db.err

  getConnection: -> @_db

  getCache: (params) ->
    conn = @getConnection()
    if conn
      # get the record from the collection that matches our hash
      conn.collection @params.db.collection, (err,coll) =>
        coll.findOne 'hash': params.hash, (err, result) =>
          if @cacheExpired(result) or err
            params.callback false
            console.log if err then 'Error connecting to cache' else 'Cache expired'
          else
            data = result
            params.callback data
            console.log 'got from cache'
    else
      params.callback false
      console.log 'failed to get cache'

  # TODO: Rather than return false, decided on whether the cache has expired using
  # the mongoDB id as the cache creation date.
  cacheExpired: (obj) ->
    # default our return variable to true (shows we don't have a cache stored yet)
    ret = true

    # If we don't have obj or obj doesn't have an _id
    # then it hasn't been saved yet so let's set our return
    # var to true here.
    # Additional option to just switch cache off!
    if @params.noCache or !obj or !obj._id
      true
    else
      # Check the timestamp, if it's inside our cache expiry time
      # then set the object to data
      timestamp = obj._id.toString().substring(0, 8)
      date = new Date parseInt(timestamp, 16) * 1000
      console.log "Cache Date: #{date}"
      false

  getApi: (callback) ->
    # Break down our url
    [url, provider, endpoint] = @params.server.request.url.match(/^\/(\w*)\/(.*)/)

    # The options hash for the api request
    options =
      host: @params.apis[provider].host
      port: @params.apis[provider].port
      path: "/#{endpoint}"
      method: 'GET'
    data = ''
    
    # The API request
    req = require(@params.apis[provider].protocol).request options, (res) ->
      res.setEncoding 'utf8'

      # Build up the response in data
      res.on 'data', (chunk) ->
        data += chunk

      # Once the api has finished, pass data to the callback
      res.on 'end', ->
        console.log 'got from api'
        callback data

    # End the request on the api
    req.end()

  saveCache: (params) ->
    if @params.noCache
      console.log 'cache turned off'
    else
      conn = @getConnection()
      if conn and params.data
        conn.collection @params.db.collection, (err, coll) ->
          object_to_insert = "hash": params.hash, "data": params.data
          coll.save object_to_insert, safe: true, (err) ->
            console.log 'saved cache'
            # params.callback object_to_insert

# Start off by defining the server
server = express.createServer express.logger()

# Initialize the server
server.get '*', (request, response) ->
  app = new App

  # Make a unique identifier for the request
  hash = require('crypto').createHash('md5').update(request.url).digest('hex')

  # Wrap everything in our database connection
  mongodb.connect private.mongolab.uri, (err, conn) ->
    # initialise the application
    app.init
      "db":
        "conn": conn
        "error": err
        "collection": "robhuzzey"
      "server":
        "request": request
        "response": response
      "apis": apis
      "noCache": true

    # Start by trying to get the cache
    app.getCache
      "hash": hash
      "callback": (cache) ->
        if cache and cache.data
          # If we have data from the cache, send it to the output
          app.output cache.data
        else
          # if we don't have data from cache, lookup in the API and send that on
          # saving to the cache again
          app.getApi (data) ->
            # Send output
            app.output data

            # Save cache
            app.saveCache
              "hash": hash
              "data": data

port = process.env.PORT or 3000
server.listen port, () ->
  console.log "Listening on #{port}" 