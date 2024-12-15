const express = require("express");
const expressWs = require("express-ws");
const path = require("path");
const mongoose = require("mongoose");
const session = require("express-session");
const bcrypt = require("bcrypt");

const PORT = 3000;
const saltRounds = 10;

//TODO: Update this URI to match your own MongoDB setup
const MONGO_URI =
  "mongodb+srv://chelseajslade:8qLRHx$$VzLgV%40i@maincluster.016yf.mongodb.net/FINALSPRINT_USERS";

//User Schema
const userSchema = new mongoose.Schema({
  username: { type: String, required: true },
  password: { type: String, required: true },
  votedPolls: [
    {
      pollId: { type: mongoose.Schema.Types.ObjectId, ref: "Poll" },
      option: String,
    },
  ],
});

//Poll Schema (including vote tracking)
const pollSchema = new mongoose.Schema({
  question: { type: String, required: true },
  option1: { type: String, required: true },
  option1Votes: { type: Number, default: 0 },
  option2: { type: String, required: true },
  option2Votes: { type: Number, default: 0 },
});

//Vote Schema
const voteSchema = new mongoose.Schema({
  pollId: { type: mongoose.Schema.Types.ObjectId, ref: "Poll", required: true },
  username: { type: String, required: true },
  selectedOption: { type: String, required: true },
});

const Poll = mongoose.model("Poll", pollSchema);
const User = mongoose.model("User", userSchema);
const Vote = mongoose.model("Vote", voteSchema);

const app = express();
expressWs(app);

app.use(express.static("public"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");
app.use(
  session({
    secret: "voting-app-secret",
    resave: false,
    saveUninitialized: false,
  })
);
let connectedClients = [];

//Mostly for testing... Make sure function writes to DB & can recognize users to login
async function seedUsers() {
  try {
    const userCount = await User.countDocuments();
    if (userCount === 0) {
      //Hash passwords
      const hashedPipPassword = await bcrypt.hash("pip123", saltRounds);
      const hashedBifPassword = await bcrypt.hash("bif123", saltRounds);
      await User.insertMany([
        { username: "pipcat", password: hashedPipPassword },
        { username: "bifcat", password: hashedBifPassword },
      ]);
      console.log("Seeded user collection");
    }
  } catch (err) {
    console.error("Error seeding users", err);
  }
}

//Testing purposes.... Seed Polls
async function seedPolls() {
  try {
    const pollCount = await Poll.countDocuments();
    if (pollCount === 0) {
      //Add Polls
      await Poll.insertMany([
        {
          question: "Green or Blue?",
          option1: "Green",
          option2: "Blue",
          option1Votes: 0,
          option2Votes: 0,
        },
        {
          question: "Cat or Dog?",
          option1: "Dog",
          option2: "Cat",
          option1Votes: 0,
          option2Votes: 0,
        },
      ]);
      console.log("Seeded polls collection");
    }
  } catch (err) {
    console.error("Error seeding polls", err);
  }
}

//Routes
app.ws("/ws", (socket, request) => {
  console.log("New WebSocket connection established");
  connectedClients.push(socket);

  socket.on("message", async (message) => {
    try {
      console.log("Received message:", message);
      const data = JSON.parse(message);

      // Validate required fields
      const { pollId, option, username } = data;

      if (!username || !pollId || !option) {
        console.error("Invalid message data: Missing fields");
        return socket.send(
          JSON.stringify({
            type: "error",
            message: "Invalid vote data. Ensure all fields are provided.",
          })
        );
      }

      // Find the poll in the database
      const poll = await Poll.findById(pollId);
      if (!poll) {
        console.error("Poll not found:", pollId);
        return socket.send(
          JSON.stringify({
            type: "error",
            message: "Poll not found.",
          })
        );
      }

      // Update votes in Polls database
      if (option === "option1") {
        poll.option1Votes += 1;
      } else if (option === "option2") {
        poll.option2Votes += 1;
      } else {
        console.error("Invalid option provided:", option);
        return socket.send(
          JSON.stringify({
            type: "error",
            message: "Invalid vote option.",
          })
        );
      }

      await poll.save();

      //Update vote database
      const newVote = new Vote({
        pollId: pollId,
        username: username,
        selectedOption: option,
      });
      await newVote.save();

      // Broadcast updated vote count to all clients
      const voteUpdate = {
        type: "voteUpdate",
        pollId: pollId,
        option: option,
        votes: option === "option1" ? poll.option1Votes : poll.option2Votes,
      };

      connectedClients.forEach((client) =>
        client.send(JSON.stringify(voteUpdate))
      );
    } catch (err) {
      console.error("Error processing vote with WebSockets.", err);
    }
  });

  socket.on("close", async () => {
    connectedClients = connectedClients.filter((client) => client !== socket);
    console.log("Client disconnected.");
  });
});

//Render index if unauthenticated, redirect to dashboard if logged in
app.get("/", async (request, response) => {
  if (request.session.user?.id) {
    return response.redirect("/dashboard");
  }

  const polls = await Poll.find().lean();
  let pollCount = polls.length;
  response.render("index/unauthenticatedIndex", {
    errorMessage: null,
    pollCount,
  });
});

//Login
app.get("/login", async (request, response) => {
  const successMessage = request.query.success
    ? "Registration successful! Login with your new account: "
    : null;

  return response.render("login", { errorMessage: null, successMessage });
});

app.post("/login", async (request, response) => {
  //Obtain username and password from login form
  const { username, password } = request.body;

  try {
    //Check database for username
    const user = await User.findOne({ username });

    //If user doesn't exist
    if (!user) {
      return response.status(400).render("login", {
        errorMessage: "Error logging in - Invalid username",
        successMessage: null,
      });
    }
    const validPassword = await bcrypt.compare(password, user.password);

    //If password invalid
    if (!validPassword) {
      return response.status(400).render("login", {
        errorMessage: "Error logging in - invalid password",
        successMessage: null,
      });
    }

    //Successful Login (create session & redirect to dashboard)
    request.session.user = {
      id: user._id,
      username: user.username,
    };

    return response.redirect("/dashboard");
  } catch (
    err
    //Error logging in
  ) {
    return response
      .status(400)
      .render("login", { errorMessage: "Invalid login credentials." });
  }
});

//SignUp
app.get("/signup", async (request, response) => {
  if (request.session.user?.id) {
    return response.redirect("/dashboard");
  }

  return response.render("signup", { errorMessage: null });
});

app.post("/signup", async (request, response) => {
  try {
    const { username, password } = request.body;

    const hashedPW = await bcrypt.hash(password, saltRounds);
    const newUser = new User({ username, password: hashedPW });
    await newUser.save();
    //Redirect to login page
    response.redirect("/login?success=true");
  } catch (err) {
    response
      .status(400)
      .json({ errorMessage: "Error adding new user", details: err.message });
  }
});

//Dashboard
app.get("/dashboard", async (request, response) => {
  const successMessage = request.query.success
    ? "Poll added successfully! "
    : null;

  if (!request.session.user?.id) {
    return response.redirect("/");
  }

  try {
    //Get username of logged in user
    const username = request.session.user.username;
    //Fetch polls
    const polls = await Poll.find().lean();
    //Fetch votes
    const userVotes = await Vote.find({ username }).lean();

    //Send to template
    return response.render("index/authenticatedIndex", {
      successMessage,
      errorMessage: null,
      username,
      polls,
      userVotes,
    });
  } catch (err) {
    console.error("Error fetching polls", err);
    response.status(500).send("Error loading dashboard.");
  }
});

//Profile
app.get("/profile", async (request, response) => {
  if (!request.session.user?.id) {
    return response.redirect("/");
  }

  try {
    //Count polls voted in
    let username = request.session.user.username;
    let voteCount = await Vote.countDocuments({ username });

    //Return profile
    return response.render("profile", {
      errorMessage: null,
      username,
      polls: [],
      voteCount,
    });
  } catch (err) {
    console.error("Error generating user profile:", err);
    response.status(500).send("Error generating user profile.");
  }
});

//Poll
app.get("/createPoll", async (request, response) => {
  return response.render("createPoll", { errorMessage: null });
});

// Poll creation
app.post("/createPoll", async (request, response) => {
  try {
    const { question, option1, option2 } = request.body;

    //Add to Database
    const newPoll = new Poll({ question, option1, option2 });
    await newPoll.save();

    //Redirect to dashboard on success
    response.redirect("/dashboard?success=true");

    //If error occurs
  } catch (err) {
    response
      .status(400)
      .json({ errorMessage: "Error adding new poll", details: err.message });
  }
});

//Logout
app.post("/logout", (request, response) => {
  //Destroy session
  request.session.destroy((error) => {
    if (error) {
      return response.status(500).send("Failed to logout");
    }
    response.redirect("/");
  });
});

//Vote
app.post("/vote", async (request, response) => {
  const { pollId, option } = request.body;
  try {
    const poll = await Poll.findById(pollId);
    if (!poll) {
      return response.status(404).send("Poll not found");
    }

    if (option === "option1") {
      poll.option1Votes = poll.option1Votes + 1;
    } else if (option === "option2") {
      poll.option2Votes = poll.option2Votes + 1;
    }

    await poll.save();
    console.log("Vote successful.");
    response.redirect("/dashboard");
  } catch (err) {
    console.error("Error processing vote:", err);
    response.status(500).json({ errorMessage: "Error processing vote." });
  }
});

//Mongo DB, server connection
(async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("MongoDB connected");

    // Seed test users after MongoDB connection
    await seedUsers();
    //Seed test polls
    await seedPolls();

    // Start the server
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("Error connecting to MongoDB or seeding users:", err);
  }
})();

/**
 * Handles creating a new poll, based on the data provided to the server
 *
 * @param {string} question The question the poll is asking
 * @param {[answer: string, votes: number]} pollOptions The various answers the poll allows and how many votes each answer should start with
 * @returns {string?} An error message if an error occurs, or null if no error occurs.
 */
async function onCreateNewPoll(question, option1, option2) {
  const newPoll = new Poll({ question, option1, option2 });
  await newPoll.save();

  const newPollData = {
    type: "newPoll",
    id: newPoll._id,
    question: newPoll.question,
    option1: newPoll.option1,
    option2: newPoll.option2,
  };

  connectedClients.forEach((client) =>
    client.send(JSON.stringify(newPollData))
  );
}
