/*
	I need help here... 
	
	This works for the following urls (assuming you are running node in localhost:5000)
	http://localhost:5000/delicious/v2/json/djhuzz?count=100
	http://localhost:5000/google/books/v1/users/101891936560271534706/bookshelves/4/volumes?maxResults=40
	
	But NOT on:
	http://localhost:5000/twitter/1/statuses/user_timeline.json?screen_name=theHuzz
	
	I just get a 'not authorised' message....
	
	If you can figure this out, I would be very happy :)

*/


// Required packages / files
var private = require( './private/private.js' ),
	express = require( 'express' ),
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


// Hold everything in a nice, easy to manage application object :)
var App = function() {
	
	return {
	
		init : function( params ) {
			this.params = params;
			this.setConnection( params.db );
		},
		
		output : function( data ) {
			this.params.server.response.send( data );
		},
	
		setConnection : function( db ) {
			// Set connection to app if we have one
			this._db = db.conn || false;
			// Log the erro if we have one
			if( db.err ) {
				console.log( db.err );
			}
		},	
		
		getConnection : function() {
			return this._db;
		},
		
		getCache : function( params ) {
			
			var self = this;
			
			var conn = this.getConnection();
			
			if( conn ) {
				// get the record from the collection that matches our hash
				conn.collection( this.params.db.collection, function( err, coll ) {
					coll.findOne( { 'hash' : params.hash }, function( err, result ) {
					
						if( self.cacheExpired( result ) || err ) {
							params.callback( false );
							console.log( ( err ? 'Error connecting to cache' : 'Cache expired' ) );
						} else {
							
							data = result;
							params.callback( data );
							console.log( 'got from cache' );
						
						}
						
					});
				});
			} else {
				params.callback( false );
				console.log( 'failed to get cache' );
			}
			
		},
		
		// TODO: Rather than return false, decided on whether the cache has expired using
		// the mongoDB id as the cache creation date.
		cacheExpired : function( obj ) {
			
			// default our return variable to true (shows we don't have a cache stored yet)
			var ret = true;
			
			// If we don't have obj or obj doesn't have an _id
			// then it hasn't been saved yet so let's set our return
			// var to true here.
			// Additional option to just switch cache off!
			if( this.params.noCache || !obj || !obj._id ) {
				ret = true;
			} else {
			
				// Check the timestamp, if it's inside our cache expiry time
				// then set the object to data
				var timestamp = obj._id.toString().substring( 0, 8 );
				var date = new Date( parseInt( timestamp, 16 ) * 1000 );
				console.log( 'Cache Date: ' + date );
				ret = false;
			}
			
			return ret;
			
		},
		
		getApi : function( callback ) {
			
			// Break down our url	
			var provider = this.params.server.request.params[0];
			var endpoint = this.params.server.request.params[1];
				
			// The options hash for the api request
			var options = {
				host: this.params.apis[provider].host,
				port: this.params.apis[provider].port,
				path: endpoint,
				method: 'GET',
				headers: {
		    		Host: this.params.apis[provider].host
		  		}
			}
			
			var data = '';
			
			// The API request
			var req = require( this.params.apis[provider].protocol ).request( options, function( res ) {
				res.setEncoding( 'utf8' );
				
				// Build up the response in data
				res.on( 'data', function( chunk ) {
					data += chunk;
				});
				
				// Once the api has finished, pass data to the callback
				res.on( 'end', function() {
					console.log( 'got from api' );
					callback( data );
				});
			});
			
			// End the request on the api
			req.end();
			
		},
		
		saveCache : function( params ) {
		
			if( this.params.noCache ) {
				console.log( 'cache turned off' );	
			} else {
				var conn = this.getConnection();			
				if( conn && params.data ) {
					conn.collection( this.params.db.collection, function( err, coll ) {
						var object_to_insert = { "hash" : params.hash, "data" : params.data };
						coll.save( object_to_insert, { safe : true }, function( err ) {
							console.log( 'saved cache' );
							//params.callback( object_to_insert );
						});
					});
				}
			}		
		}
		
	};
	
};




// Start off by defining the server
var server = express.createServer( express.logger() );

// Initialize the server
server.get( /^\/([a-zA-Z0-9]+)(.*)/, function( request, response ) {

	var app = new App();

	if( request.params[1] != '.ico' ) {

		// Make a unique identifier for the request
		var hash = require( 'crypto' ).createHash( 'md5' ).update( request.url ).digest( 'hex' );
	
	
		// Wrap everything in our database connection
		mongodb.connect( private.mongolab.uri, function( err, conn ) {
			
			// initialise the application		
			app.init({
				"db" : {
					"conn" : conn,
					"error" : err,
					"collection" : "robhuzzey"
				},
				"server" : {
					"request" : request,
					"response" : response
				},
				"apis" : apis,
				
				"noCache" : true
			});
			
			// Start by trying to get the cache
			app.getCache({
				"hash" : hash,
				"callback" : function( cache ) {
					
					if( cache && cache.data ) {
						// If we have data from the cache, send it to the output
						app.output( cache.data );
					} else {
					
						// if we don't have data from cache, lookup in the API and send that on
						// saving to the cache again
						app.getApi( function( data ) {
							
							// Send output
							app.output( data );
							
							// Save cache
							app.saveCache({
								"hash" : hash,
								"data" : data
							});
							
						});
						
					}
				}
			});
			
		});
	
	}
	
});



var port = process.env.PORT || 3000;
server.listen( port, function() {
	console.log( "Listening on " + port );
});

