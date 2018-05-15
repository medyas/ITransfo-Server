#!/usr/bin/env nodejs
const admin = require('firebase-admin');
const MongoClient = require('mongodb').MongoClient

var url = "mongodb://localhost:27017/deviceData";

var db;

var serviceAccount = require("./itransfo-adminsdk.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://itransfo-3252d.firebaseio.com"
});


var database = admin.firestore();
var messages = admin.messaging();

/* --------------------------------------------------------------------- */

var express = require('express');
var bodyParser = require('body-parser');
var multer = require('multer'); // v1.0.5
var upload = multer(); // for parsing multipart/form-data
var cookieParser = require('cookie-parser')
var path = require('path');
var moment = require('moment');
var time = moment()
/* --------------------------------------------------------------------- */

var app = express();

// set the view engine to ejs
app.set('view engine', 'ejs');
app.use(bodyParser.json()); // for parsing application/json
app.use(bodyParser.urlencoded({ extended: true, inflate: true })); // for parsing application/x-www-form-urlencoded
app.use(cookieParser());

app.use(function(req, res, next) {  
      res.header('Access-Control-Allow-Origin', req.headers.origin);
      res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
      next();
 }); 

/* --------------------------------------------------------------------- */
/*
**
		App URL Requests

*/

	function dateTime() {
		var currentdate = new Date(); 
		return  currentdate.getDate() + "/"
	                + (currentdate.getMonth()+1)  + "/" 
	                + currentdate.getFullYear() + " "  
	                + currentdate.getHours() + ":"  
	                + currentdate.getMinutes() + ":" 
	                + currentdate.getSeconds();
	}


function setMessages(obj) {
	db.collection('messages').insertOne(obj, (error, db) => {
			if (error) return false;
			return true;
		})
}

function sendNotification(title, msg, ref) {
	var message = {
	  notification: {
	    title: title,
	    body: msg
	  },
	  topic: ref
	};

	// Send a message to devices subscribed to the combination of topics
	// specified by the provided condition.
	messages.send(message)
	  .then((response) => {
	    // Response is a message ID string.
	    console.log('message sent!');
	    return true;
	  })
	  .catch((error) => {
	  	console.log('could not send message :(');
	    return false;
	  });
} 

function getParams(ref) {
	db.collection('parameters').find({'device_ref': ref}).toArray((error, data) => {
			if(error) return null;
			return data;
		})
}

function compareData(obj) {
	var params = getParams(obj.device_ref);
	return false;
}


function checkData(obj) {
	if(compareData(obj)) {
		d = {
			'msg': '',
			'data_id': obj._id,
			'device_ref': obj.device_ref,
			'timestamp': dateTime()
		};
		setMessages(d);
		sendNotification("ITransfo: Device Warning", "Device Warning - "+obj.device_ref, obj.device_ref);
	}
}


/*
*
*	Receive data from device
*
/* --------------------------------------------------------------------- */

app.post('/setdata/', upload.array(), (req, res) => {
	
	database.collection('devices').where('device_ref', '==', req.body.device_ref).get().then(docs => {
		obj = req.body
		obj['timestamp'] = dateTime()
		db.collection('data').insertOne(obj, (error, db) => {
			if (error) return res.status(403).send('Could Not set Data');
			return res.status(200).send("done");
		})
		checkData(obj);
		return true
	}).catch(error => {
		return res.status(403).send('Could Not set Data');
	})
})


/**		Set User Notification Token
**
*/

app.post('/setToken/', upload.array(), (req, res) => {
	var user = database.collection('users').doc(String(req.body.client_uid))
		user.update({
			'appToken': req.body.tokenId
		});
	return res.status(200).send("done");
})


app.post('/getUserDevices/', upload.array(), (req, res) => {
	var d = []

	database.collection('linked_devices').where('client_uid', '==', req.body.client_uid).get().then(docs => {
		docs.forEach(function(doc) {
			d.push(doc.data())
		})

    	res.setHeader('Content-Type', 'application/json');
		return res.status(200).send(d);
	}).catch(error => {
		console.log(error)
		return res.status(403).send('Could Not Get Devices');
	})
	
})

app.post('/getUserDevicesInfo/', upload.array(), (req, res) => {
	var ref = []
	var d = []

	database.collection('linked_devices').where('client_uid', '==', req.body.client_uid).get().then(docs => {
		docs.forEach(function(doc) {
			ref.push(doc.data().device_ref)
		})

		database.collection('devices').get().then(snapshots => {
			snapshots.forEach(snapshot => {
				if(ref.indexOf(snapshot.data().device_ref) != -1) {
					d.push(snapshot.data());
				}
		      });
			res.setHeader('Content-Type', 'application/json');
			return res.status(200).send(d);
		}).catch(error => {
			return res.status(403).send('Could Not Get Devices');
		})
		return true;
	}).catch(error => {
		console.log(error)
		return res.status(403).send('Could Not Get Devices');
	})
	
})

app.post('/getdeviceData/', upload.array(), (req, res) => {
	db.collection('data').find({'device_ref': req.body.device_ref}).sort({timestamp: -1}).toArray((error, data) => {
		if(error) return res.status(403).send('Could Not Get Data');
		res.setHeader('Content-Type', 'application/json');
    	return res.status(200).send(data);
	})
})


app.post('/getdatedata/', upload.array(), (req, res) => {
	db.collection('data').find({device_ref: req.body.device_ref, timestamp: new RegExp(req.body.date)}).sort({timestamp: 1}).toArray((error, data) => {
		if(error) return res.status(403).send('Could Not Get Data');
		res.setHeader('content-type', 'application/json');
		return res.status(200).send(data);
	})
})

app.post('/getlatestdata/', upload.array(), (req, res) => {
	db.collection('data').find({'device_ref': req.body.device_ref}).sort({timestamp: -1 }).toArray((error, data) => {
		if(error) return res.status(403).send('Could Not Get Data');
		res.setHeader('Content-Type', 'application/json');
    		return res.status(200).send(data[0]);
	})
})

app.post('/setprameters/', upload.array(), (req, res) => {
	var obj = req.body
	database.collection('devices').where('device_ref', '==', req.body.device_ref).get().then(docs => {
		db.collection('parameters').insertOne(obj, (error, db) => {
			if (error) return res.status(403).send('Could Not set Data');
			return res.status(200).send("done");
		})
	}).catch(error => {
		return res.status(403).send('Could Set Device prameters');
	})
})

app.post('/getparameters/', upload.array(), (req, res) => {
	database.collection('devices').where('device_ref', '==', req.body.device_ref).get().then(docs => {
		db.collection('parameters').find({'device_ref': req.body.device_ref}).toArray((error, data) => {
			if(error) return res.status(403).send('Could Not Get Data');
			res.setHeader('Content-Type', 'application/json');
	    	return res.status(200).send(data);
		})
	}).catch(error => {
		return res.status(403).send('Could Not Get Parameters');
	})
})

app.post('/updateprameters/', upload.array(), (req, res) => {
	database.collection('devices').where('device_ref', '==', req.body.device_ref).get().then(docs => {
		db.collection('parameters').update({'device_ref': req.body.device_ref}, {$set:{
			'pri_voltage': req.body.pri_voltage,
		    'sec_voltage': req.body.sec_voltage,
		    'pri_current': req.body.pri_current,
		    'sec_current': req.body.sec_current,
		    'internal_temp': req.body.internal_temp,
		    'external_temp': req.body.external_temp
		}})
		return res.status(200).send('done');
	}).catch(error => {
		return res.status(403).send('Could Set Device prameters');
	})
})

app.post('/getmessages/', upload.array(), (req, res) => {
	database.collection('devices').where('device_ref', '==', req.body.device_ref).get().then(docs => {
		db.collection('messages').find({'device_ref': req.body.device_ref}).sort({timestamp: -1}).toArray((error, data) => {
			if(error) return res.status(403).send('Could Not Get Data');
			res.setHeader('Content-Type', 'application/json');
	    	return res.status(200).send(data);
		})
	}).catch(error => {
		return res.status(403).send('Could Not Get Parameters');
	})
})

app.post('/devicesub/', upload.array(), (req, res) => {
	database.collection('linked_devices').where('client_uid', '==', req.body.client_uid).get().then(docs => {
		var obj=[];
		docs.forEach(function(doc) {
			obj.push(doc.data().device_ref)
		})
		res.setHeader('Content-Type', 'application/json');
	    return res.status(200).send(obj);
	}).catch(error => {
		return res.status(403).send('Could Not Get Parameters');
	})
})



/* --------------------------------------------------------------------- */

app.get('**', (req, res) => {
	return res.redirect('https://itransfo.tk')
})


//app.listen(3000, () => console.log('Example app listening on port 3000!'))

MongoClient.connect(url, (err, client) => {
  if (err) return console.log(err)
  db = client.db('deviceData') // whatever your database name is
  app.listen(3000, () => {
    console.log('listening on 3000')
  })
})
