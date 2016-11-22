
// var ChatServer = require('node-chat-server');
var ChatServer = require('../node-chat-server');
var mongodb = require('mongodb');
var async = require('async');

/*
 options:
  url - mongo url.

*/

module.exports = function (options, callback) {

  // first connect to the database.
  mongodb.connect(options.url || 'mongodb://localhost:27017/chatserver', function(err, db) {

      if(err){
        throw err;
      }

      // point to a collection holding all chat messages.
      var chats = db.collection(options.chats || 'chats');

      // point to a collection of users for authentication.
      var users = db.collection(options.users || 'users');

      // point to a collection of groups holding user ids.
      var groups = db.collection(options.groups || 'groups');

      var actions = {

        getUsersAndGroups(socket, data, callback){

            async.parallel([function (cb) {  // get all users.
              users.find({}).toArray(cb);
            },function (cb) {    // get the groups that the user belongs to.
              groups.find({ users: socket.user._id.toString() }).toArray(cb);
            }], function (err, results) {
              var array = results || [];
              callback(err, { users: array[0], groups: array[1] });
            });

        }

      };

      if (options.actions) {
        for (var m in options.actions) {
          actions[m] = options.actions[m];
        }
      }


      var serverOptions = {

          port: options.port || 4001,   // the port that the chat server will listen on. defaults to 8080.

          log: ('log' in options ? options.log : true),    // log activities to the console. used for debugging purposes.

          authorize: options.authorize || function(data, callback){  // all connecting sockets will need to authorize before doing anything else.
                                      // the callback is expecting some kind of user object as the second argument.
             users.findOne({ token: data.token }, callback);

          },

          create: options.create || function(message, callback){  // create a new chat message.

            chats.insertOne(message, function (err, res) {
              callback(err, message);
            });

          },

          getMessages: options.getMessages || function(query, callback){  // find chat messages between two users, or a user and a group.

              // find chat messages between two users, or a user and a group.
              // query.ids is an array with two ids in it.
              // the first id belongs to the user that is requesting the mesasges.ng
              // the second id can be a user id or a group id.
              var findQuery;
              if(query.isGroup){
                findQuery = { to: query.ids[1]};
              }
              else{
                findQuery = {
                  $or: [
                    { from: query.ids[0], to: query.ids[1] },
                    { from: query.ids[1], to: query.ids[0] }
                  ]
                };
              }
              var cursor = chats.find(findQuery);

              // sort by descending creation date. 'createdAt' is added by the chat server to every message.
              cursor.sort({ createdAt: -1 });

              // skip items
              cursor.skip(query.skip);

              // limit items
              cursor.limit(query.limit);

              // execute
              cursor.toArray(callback);

          },

          getGroupUserIds: options.getGroupUserIds || function(data, callback){  // get an array of user ids for a specific group.

            groups.findOne({ _id: mongodb.ObjectId(data.groupId) }, function (err, group) {
              callback(err, group && group.users);
            });

          },

          read: options.read || function(id, callback){  // mark a chat message as having been read by the recipient.

              chats.findOneAndUpdate({ _id: mongodb.ObjectId(id) }, { $set: { read: true }}, {}, callback);

          },

          actions: actions,

          openActions: options.openActions || {}

      };

      // start the chat server.
      var chatServer = new ChatServer(serverOptions);
      callback({
        server: chatServer,
        mongo: db,
        chats: chats,
        groups: groups,
        users: users,
        ObjectId: mongodb.ObjectId
      });

  });
}
