// Some sensitive info - Hate doing it like this but no choice due to how Heroku works :(
var private = require( './private/private.js' ) || { twitter : null, mongolab : null };
private.twitter.screen_name = private.twitter.screen_name || process.env.twitterScreenName;
private.mongolab.apiKey = private.mongolab.apiKey || process.env.mongoLabApiKey;
private.mongolab.uri = private.mongolab.uri || process.env.mongoLabUri;

// Required packages / files
var	express = require( 'express' ),
	mongodb = require( 'mongodb' );

// The api end points
var apis = {
	"twitter" : {
		"host" : "api.twitter.com",
		"protocol" : "http",
		"port" : 80
	},
	"delicious" : {
		"host" : "feeds.delicious.com",
		"protocol" : "http",
		"port" : 80
	},
	"google" : {
		"host" : "www.googleapis.com",
		"protocol" : "https",
		"port" : 443
	}
};

// Hold the collection in mongoDB I am using
var collection = 'robhuzzey';

var appHelpers = function( mongoDBconn, collection ) {

	return {

		conn : mongoDBconn,
		
		getCache : function( options ) {
			// If we have a connection, let's try and get the cache, otherswise drop right into erro callback
			if( this.conn ) {
				var self = this;
				self.conn.collection( collection, function( err, coll ) {
					coll.findOne( { 'hash' : options.hash }, function( err, result ) {
						if( result ) {
							// If the record we found has expired, drop into error callback
							// otherwise success
							if( self.cacheExpired( result ) ) {
								options.error( result );
								console.log( 'uh oh!' );
							} else {
								options.success( result );
							}
						} else {
							options.error( result );
						}
					});
				});
			} else {
				options.error();
				console.log( 'Unable to establish connection to mongoDB' );
			}					
		},
		
		saveCache : function( options ) {
		
			if( this.conn ) {
				// Save the cache
				this.conn.collection( collection, function( err, coll ) {
					var object_to_insert = { "hash" : options.hash, "data" : options.data, "created" : null, "modified" : null };
						
					// Set the _id to our object_to_insert if we have one
					if( options.mongoObj && options.mongoObj._id ) {
						object_to_insert['_id'] = options.mongoObj._id;
						object_to_insert['modified'] = new Date();
					} else {
						object_to_insert['created'] = new Date();
					}
					
					// Now save / update the object
					coll.save( object_to_insert, { safe : true }, function( err ) {
						console.log( 'saved cache' );
					});								
					
				});
			} else {
				console.log( 'Unable to establish connection to mongoDB' );
			}
		
		},
		
		cacheExpired : function( obj ) {
			// Hold the lastmodified date that could be created date if new item
			var lastModified = obj.modified ? obj.modified : obj.created;
			
			// Setup the expiry date
			var expires = lastModified;
			expires.setHours( expires.getHours() + 1 ); // 1 hour expiry
			console.log( 'Expiry Date: ' + expires );
			
			var now = new Date();
			console.log( 'Now: ' + now );
			
			// Check if our expiry date is after now (returns bool)
			return ( now > expires );
		}

	};
	
};


// Start off by defining the server
var server = express.createServer( express.logger() );

// Initialize the server
server.get( '*' , function( request, response ) {

	// Quick fix to prevent the .ico file triggering this code
	if( request.params[0] != '/favicon.ico' ) {
	
		// Make a unique identifier for the request
		var hash = require( 'crypto' ).createHash( 'md5' ).update( request.url ).digest( 'hex' );	
		
		// First up, see if we have a cache of this request already
		mongodb.connect( private.mongolab.uri, function( err, conn ) {
			
			// Init a new helper and try to get the cache
			var helper = new appHelpers( conn, collection );
			helper.getCache({
				"hash" : hash,
				"success" : function( data ) {
					console.log( 'got from cache' );
					response.send( data.data );
				},
				"error" : function( mongoObj ) {
					
					// Break down the request url into parts we need	
					var url = request.url.match(/^\/(\w*)\/(.*)/);
					var provider = url[1];
					var endpoint = url[2];
					
					// The options hash for the api request
					var options = {
						host: apis[provider].host,
						port: apis[provider].port,
						path: '/' + endpoint,
						method: 'GET'
					}
					
					var data = '';
					
					// The API request
					var req = require( apis[provider].protocol ).request( options, function( res ) {
						res.setEncoding( 'utf8' );
						
						// Build up the response in data
						res.on( 'data', function( chunk ) {
							data += chunk;
						});
						
						// Once the api has finished, send output & save the cache
						res.on( 'end', function() {
							console.log( 'got from api' );
							response.send( data );
							
							helper.saveCache({
								"hash" : hash,
								"data" : data,
								"mongoObj" : mongoObj
							});
							
						});
					});
					
					// End the request on the api
					req.end();			
				
				}
				
			});
				
				
			
		});
			
	
	}
	
});


var port = process.env.PORT || 5000;
server.listen( port, function() {
	console.log( "Listening on " + port );
});

