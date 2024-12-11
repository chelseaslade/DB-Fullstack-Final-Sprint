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
const userSchema = new mongoose.Schema({
  username: { type: String, required: true },
  password: { type: String, required: true },
});

const pollSchema = new mongoose.Schema({
  question: { type: String, required: true },
  option1: { type: String, required: true },
  option2: { type: String, required: true },
});

const Poll = mongoose.model("Poll", pollSchema);
const User = mongoose.model("User", userSchema);

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
        { question: "Green or Blue?", option1: "Green", option2: "Blue" },
        { question: "Cat or Dog?", option1: "Dog", option2: "Cat" },
      ]);
      console.log("Seeded polls collection");
    }
  } catch (err) {
    console.error("Error seeding polls", err);
  }
}

//Note: Not all routes you need are present here, some are missing and you'll need to add them yourself.

app.ws("/ws", (socket, request) => {
  connectedClients.push(socket);

  socket.on("message", async (message) => {
    const data = JSON.parse(message);
  });

  socket.on("close", async (message) => {});
});

//Render index if unauthenticated, redirect to dashboard if logged in
app.get("/", async (request, response) => {
  if (request.session.user?.id) {
    return response.redirect("/dashboard");
  }

  response.render("index/unauthenticatedIndex", { errorMessage: null });
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

  return response.render("index/authenticatedIndex", {
    successMessage,
    errorMessage: null,
    username: request.session.user.username,
    polls: [],
  });
});

app.post("/dashboard", async (request, response) => {});

//Profile
app.get("/profile", async (request, response) => {
  if (!request.session.user?.id) {
    return response.redirect("/");
  }

  return response.render("profile", {
    errorMessage: null,
    username: request.session.user.username,
    polls: [],
  });
});

//Poll
app.get("/createPoll", async (request, response) => {
  return response.render("createPoll", { errorMessage: null });
});

// Poll creation
app.post("/createPoll", async (request, response) => {
  try {
    const { question, option1, option2 } = request.body;
    // const formattedOptions = Object.values(options).map((option) => ({
    //   answer: option,
    //   votes: 0,
    // }));

    //Add to Database
    const newPoll = new Poll({ question, option1, option2 });
    await newPoll.save();

    //On Success
    console.log("Poll added to database");
    //Redirect to dashboard
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
async function onCreateNewPoll(question, pollOptions) {
  try {
    //TODO: Save the new poll to MongoDB
  } catch (error) {
    console.error(error);
    return "Error creating the poll, please try again";
  }

  //TODO: Tell all connected sockets that a new poll was added

  return null;
}

/**
 * Handles processing a new vote on a poll
 *
 * This function isn't necessary and should be removed if it's not used, but it's left as a hint to try and help give
 * an idea of how you might want to handle incoming votes
 *
 * @param {string} pollId The ID of the poll that was voted on
 * @param {string} selectedOption Which option the user voted for
 */
async function onNewVote(pollId, selectedOption) {
  try {
  } catch (error) {
    console.error("Error updating poll:", error);
  }
}
