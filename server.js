const express = require('express');
const fs = require("fs");
var path = require('path');
const http = require('http');

const { makeid } = require('./utils');

const PORT= process.env.PORT || 3000; 
const INDEX = path.join(__dirname, 'frontend');
const app = express()

const server = http.createServer(app);
const io = require('socket.io')(server, {
    cors: {
        origin: '*',
        methods: ["GET", "POST"]
    }
});

app.get("/", function(req, res) {
    res.sendFile(path.join(__dirname, '/frontend/index.html'));
});
app.use(express.static(__dirname + '/frontend/'));

const clientRooms = {};
const state = {};

let rawWords = fs.readFileSync('words.json');
const matchDict = JSON.parse(rawWords)["words"];
const numWords = matchDict.length;

function getRandomWord() {
  const idx = Math.floor(numWords * Math.random());
  return matchDict[idx];
}

function initGame()
{
    // initialize the game
    const game = {
        word: "",
        timeStart: 0,
        timeEnd: 0,
        timeStart: 0,
        active: false,
        guessCount: 7,
        wordLength: 5,
        roundLength: 90
    };
    
    return game;
}

io.on('connection', client => {
    
    client.on('guessWord', handleGuessWord);
    client.on('newGame', handleNewGame);
    client.on('joinGame', handleJoinGame);
    client.on('startGame', handleStartGame);
    client.on('updateSettings', handleUpdateSettings);
    client.on('disconnect', handleDisconnect);

    function handleJoinGame(roomName, username) {
        const room = io.sockets.adapter.rooms[roomName];
        
        let allUsers;
        if (room) {
            allUsers = room.sockets;
        }

        let numClients = 0;
        if (allUsers) {
            numClients = Object.keys(allUsers).length;
        }

        if (numClients === 0) {
            client.emit('unknownCode');
            return;
        } else if (numClients > 6) {
            client.emit('tooManyPlayers');
            return;
        }
        client.emit('gameCode', roomName, false);

        clientRooms[client.id] = roomName;

        initClient(client, username);

        client.emit('init', getGameSettings(roomName, allUsers));

        client.join(roomName);
        io.to(roomName).emit('userJoined', client.id, client.username, client.wins);
    }

    function initClient(client, username, host = false){
        client.username = username;
        client.host = host;
        client.active = false;
        client.wins = 0;
        client.points = 0;
        client.currentGuesses = [];
        client.currentPoints = 0;
    }

    function handleNewGame(username) {
        var alreadyInRoom = clientRooms[client.id] == undefined ? false : true;
        if(!alreadyInRoom) {
            let roomName = makeid(5);
            clientRooms[client.id] = roomName;
            client.emit('gameCode', roomName, true);
            state[roomName] = initGame();

            client.join(roomName);
            initClient(client, username, true);

            client.emit("userJoined", client.id, username, client.wins);
            console.log("starting room " + roomName);
            client.emit('init', getGameSettings(roomName));
        }else{
            client.emit('alreadyInRoom');
        }
    }

    function getGameSettings(roomName, allUsers){
        var userData = {}
        if(allUsers){
            
            for (var clientId in allUsers) {
                console.log('client:', clientId);
                var client_socket = io.sockets.connected[clientId];
                userData[clientId] = {
                    username:client_socket.username,
                    wins:client_socket.wins,
                    currentGuesses:client_socket.currentGuesses,
                }
            }
        }

        return {
            existingUserData: userData,
            wordLength: state[roomName].wordLength,
            guessCount: state[roomName].guessCount,
            roundLength: state[roomName].roundLength,
        }
    }
    
    function handleStartGame(){
        const roomName = clientRooms[client.id];
        if(!roomName) {
            return;
        }
        // end time
        if(client.host == true && state[roomName].active == false){
            // room settings
            var roundLength = state[roomName].roundLength;
            var wordLength = state[roomName].wordLength;
            var guessCount = state[roomName].guessCount;

            var roundDuration = roundLength || 120; // in seconds
            console.log("starting game in room " + roomName + " for " + roundDuration + " seconds");
            var roundDurationMs = roundDuration * 1000;
            var endTime = new Date().getTime() + roundDurationMs;

            // set all clients to active
            for (var clientId in io.sockets.adapter.rooms[roomName].sockets) {
                var client_socket = io.sockets.connected[clientId];
                client_socket.active = true;
            }

            var timed = roundLength ? roundLength > 0 : false;
            var gameSettings = {
                timed: timed,
                endTime: endTime,
                wordLength: wordLength,
                guessCount: guessCount
            }

            state[roomName].word = getRandomWord(wordLength)
            state[roomName].endTime = endTime
            state[roomName].startTime = new Date().getTime()
            state[roomName].active = true;

            var word = state[roomName].word;
            console.log("starting room, word " + word);
            // game officially started
            io.to(roomName).emit('roomReady', gameSettings);
            if(timed){
                let promise = new Promise(function(resolve, reject) {
                    var currentWord = state[roomName].word;
                    setTimeout(() => {
                        var latestWord = state[roomName].word;
                        // make sure the word hasn't changed
                        // if it has, its a new room

                        // TODO maybe use now and startTime with a tolerance to determine if its a new room
                        // var now = new Date().getTime();

                        if(latestWord == currentWord && state[roomName].active == true) {
                            resolve();
                        }else{
                            // invalid timer, game already ended or new round started
                            reject();
                        }
                        
                    }, roundDurationMs) 
                });
                promise.then(result => {
                    // timer expired, nobody wins
                    sendRoundEnd(roomName, {
                        method:"timedOut"
                    });
                }, error => {
                    // invalid timer, ignore
                });
            }
        }
    }

    function handleUpdateSettings(gameSettings){
        const roomName = clientRooms[client.id];
        if(!roomName) {
            return;
        }

        // update room settings
        if(client.host == true && state[roomName].active == false){
            // validate settings
            state[roomName].guessCount = gameSettings.guessCount || 7;
            state[roomName].wordLength = gameSettings.wordLength || 5;
            state[roomName].roundLength = gameSettings.roundLength || 90;
            var timed = gameSettings.roundLength ? gameSettings.roundLength > 0 : true;
            state[roomName].timed = timed;

            // object of valid settings
            var validGameSettings = {
                guessCount: state[roomName].guessCount,
                wordLength: state[roomName].wordLength,
                roundLength: state[roomName].roundLength,
                timed: timed
            };

            // update all clients
            io.to(roomName).emit('updateSettings', validGameSettings);
        }
    }

    function handleGuessWord(guess){
        // TODO use active property to disable input from player that joined in the middle of a round
        const roomName = clientRooms[client.id];
        if(!roomName) {
            return;
        }
        var roomData = state[roomName];

        
        // check valid word
        if(!matchDict.includes(guess)) {
            client.emit('guess_invalidWord');
            return;
        }

        // get correct letters
        var letterResponse = getLetterResponse(roomData.word, guess)
        var correctLetters = letterResponse.correctLetters;
        var letterRes = letterResponse.letterRes;

        client.currentGuesses.push(letterRes);
        client.currentPoints = Math.max(client.currentPoints, correctLetters);
        
        var resObject = {id: client.id, letters:letterRes}
        // client.emit("guess_response", resObject);
        io.to(roomName).emit('guess_response', resObject);

        if(correctLetters == roomData.word.length) {
            client.wins += 1;

            // client won the game
            client.emit('guess_win');
            sendRoundEnd(roomName, {
                winner: client.id,
                method: "playerWon"
            });
            return;
        }

        if(client.currentGuesses.length == roomData.guessCount){
            // client is out of guesses
            // check if everyone is out of guesses
            var allOutOfGuesses = true;
            for (var clientId in io.sockets.adapter.rooms[roomName].sockets) {
                var client_socket = io.sockets.connected[clientId];
                if(client_socket.currentGuesses < roomData.guessCount && client_socket.active == true){
                    allOutOfGuesses = false;
                }
            }

            console.log("everyone out of guesses "+allOutOfGuesses);

            if(allOutOfGuesses){
                // everyone is out of guesses, end round
                sendRoundEnd(roomName, {
                    method:"guessLimit"
                });
            }
            return;   
        }
    }

    // game end data:
    /*
        {
            winner: client.id,
            method: "timedOut | playerWon | guessLimit"
        }
    */
    function sendRoundEnd(roomName, gameEndData){
        // add up the intermediate points for all clients
        var totalScore = {}
        for (var clientId in io.sockets.adapter.rooms[roomName].sockets) {
            var client_socket = io.sockets.connected[clientId];
            client_socket.points += client_socket.currentPoints;
            client_socket.currentPoints = 0;
            totalScore[clientId] = {
                wins: client_socket.wins,
                points: client_socket.points
            }
        }

        var roundEndObject = {
            method: gameEndData.method,
            winnerId: gameEndData.winner,
            totalScore:totalScore,
            word: state[roomName].word
        }
        // set active to false
        state[roomName].active = false;
        io.to(roomName).emit('roundEnd', roundEndObject);
    }

    function getLetterResponse(actualWord, guess){
        var letterRes = Array.from({length: actualWord.length}, () => 0)
        const LETTER_CORRECT = 2;
        const LETTER_EXISTS = 1;
        const LETTER_DOESNT_EXIST = 0;

        var correctLetters = 0;

        var stillNeeded = {}
        for(var i = 0; i < actualWord.length; i++){
            var l = actualWord[i];
            if(stillNeeded[l] == undefined){
                stillNeeded[l] = 1;
            }else{
                stillNeeded[l] += 1;
            }
        }

        for(var i = 0; i < actualWord.length; i++){
            let guessLetter = guess.charAt(i);
            let solutionLetter = actualWord.charAt(i);
            if(solutionLetter == guessLetter){
                letterRes[i] = LETTER_CORRECT;
                correctLetters += 1;
                stillNeeded[solutionLetter] -= 1;
            }
        }

        for(var i = 0; i < actualWord.length; i++){
            let guessLetter = guess.charAt(i);
            let solutionLetter = actualWord.charAt(i);
            // console.log("final check "+stillNeeded[solutionLetter])
            if(actualWord.indexOf(guessLetter) != -1  && stillNeeded[guessLetter] > 0){
                letterRes[i] = LETTER_EXISTS;
            }else if(actualWord.indexOf(guessLetter) == -1){
                letterRes[i] = LETTER_DOESNT_EXIST;
            }
        }
        

        return {
            "correctLetters": correctLetters,
            "letterRes": letterRes
        };
    }

    function handleDisconnect(){
        const roomName = clientRooms[client.id];
        if(!roomName) {
            return;
        }
        // remove client from room
        client.leave(roomName);
        // remove room if empty
        if(io.sockets.adapter.rooms[roomName] && io.sockets.adapter.rooms[roomName].length == 0){
            delete state[roomName];
            delete io.sockets.adapter.rooms[roomName];
        }else if(io.sockets.adapter.rooms[roomName]){
            // send message to other players
            io.to(roomName).emit('playerDisconnected', client.id);
            // reassign host if the host left
            if(client.host == true){
                for (var clientId in io.sockets.adapter.rooms[roomName].sockets) {
                    var client_socket = io.sockets.connected[clientId];
                    if(client_socket.host == false){
                        client_socket.host = true;
                        client_socket.emit("hostAssigned");
                        break;
                    }
                }
            }
        }
    }
});

// server.listen(PORT);
server.listen(PORT, () => {
    console.log(`Listening on port ${PORT}`)
})