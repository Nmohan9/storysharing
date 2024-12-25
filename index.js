const express = require("express");
const path = require("path");
const bodyParser = require("body-parser");
const { MongoClient, ObjectId } = require("mongodb");
const { initializeApp } = require("firebase/app");
const { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, updateProfile } = require("firebase/auth");

const app = express();
const port = 9100;

const firebaseConfig = {
  apiKey: "AIzaSyDzDndqZHyYRhrEaPECNnrvXIgfECbWWp4",
  authDomain: "story-14143.firebaseapp.com",
  projectId: "story-14143",
  storageBucket: "story-14143.firebasestorage.app",
  messagingSenderId: "709084970199",
  appId: "1:709084970199:web:b0bc39807b2c0fdecd4492",
  measurementId: "G-2SN44LGV3B"
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);

// MongoDB setup
const mongoUri = "mongodb+srv://story:rFCwEEOsSC9mTbJt@cluster0.5xeel.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
let dbClient;

async function connectToDB() {
  dbClient = new MongoClient(mongoUri);
  try {
    await dbClient.connect();
    console.log("Connected to MongoDB");
  } catch (error) {
    console.error("Failed to connect to MongoDB:", error);
    process.exit(1);
  }
}
connectToDB();

// Express app setup
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// Middleware: Check authentication
function isAuthenticated(req, res, next) {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      req.user = user;
      next();
    } else {
      res.redirect("/login");
    }
  });
}

// Routes
app.get("/", async (req, res) => {
  try {
    const storage = dbClient.db("storyDB").collection("stories");

    const stories = await storage.find({ public: true }).sort({ likes: -1 }).toArray();

    res.render("story", { stories, currentUserId: null, pageTitle: "All Stories" });
  } catch (error) {
    console.log("Error fetching stories:", error);
    res.status(500).send("Error fetching stories");
  }
});

app.get("/signup", (req, res) => {
  res.render("signup");
});

app.post("/signup", async (req, res) => {
  const { name, email, password, confirmPassword } = req.body;

  if (password !== confirmPassword) {
    return res.status(400).send("Passwords do not match");
  }

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Update the user's display name in Firebase Authentication
    await updateProfile(user, { displayName: name });

    console.log(`User ${name} signed up successfully`);
    res.redirect("/login");
  } catch (error) {
    console.error("Error signing up:", error.message);
    res.status(500).send(`Error signing up. Please try again. Error: ${error.message}`);
  }
});

app.get("/login", (req, res) => {
  res.render("login");
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    await signInWithEmailAndPassword(auth, email, password);
    res.redirect("/submit-story");
  } catch (error) {
    console.error("Error logging in:", error.message);
    res.status(500).send("Error logging in. Please try again.");
  }
});

app.get("/submit-story", isAuthenticated, (req, res) => {
  res.render("submitStory");
});

app.post("/submit-story", isAuthenticated, async (req, res) => {
  const { title, description, content, genre, visibility } = req.body;
  const userId = req.user.uid;

  try {
    const storage = dbClient.db("storyDB").collection("stories");
    await storage.insertOne({
      title,
      description,
      content,
      genre,
      userId,
      likes: 0,
      public: visibility === "public",
    });
    res.redirect("/");
  } catch (error) {
    console.log("Error submitting story:", error);
    if (!res.headersSent) {
      res.status(500).send("Error submitting story");
    }
  }
});

app.get("/profile", isAuthenticated, async (req, res) => {
  const userId = req.user.uid;

  try {
    const storage = dbClient.db("storyDB").collection("stories");

    const stories = await storage.find({ userId }).sort({ likes: -1 }).toArray();

    res.render("story", { stories, currentUserId: userId, pageTitle: "Your Stories" });
  } catch (error) {
    console.log("Error fetching private stories:", error);
    if (!res.headersSent) {
      res.status(500).send("Error fetching private stories");
    }
  }
});

app.get("/edit-story/:id", isAuthenticated, async (req, res) => {
  const storyId = req.params.id;
  const userId = req.user.uid;

  try {
    const storage = dbClient.db("storyDB").collection("stories");
    const story = await storage.findOne({ _id: new ObjectId(storyId), userId });

    if (!story) {
      return res.status(404).send("Story not found or you do not have permission to edit this story.");
    }

    res.render("editStory", { story });
  } catch (error) {
    console.log("Error fetching story for editing:", error);
    if (!res.headersSent) {
      res.status(500).send("Error fetching story for editing");
    }
  }
});

app.post("/edit-story/:id", isAuthenticated, async (req, res) => {
  const storyId = req.params.id;
  const userId = req.user.uid;
  const { title, description, content, genre, visibility } = req.body;

  try {
    const storage = dbClient.db("storyDB").collection("stories");
    const result = await storage.updateOne(
      { _id: new ObjectId(storyId), userId },
      {
        $set: {
          title,
          description,
          content,
          genre,
          public: visibility === "public",
        },
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).send("Story not found or you do not have permission to edit this story.");
    }

    res.redirect("/profile");
  } catch (error) {
    console.log("Error updating story:", error);
    if (!res.headersSent) {
      res.status(500).send("Error updating story");
    }
  }
});

app.post("/like/:id", async (req, res) => {
  const storyId = req.params.id;

  try {
    const storage = dbClient.db("storyDB").collection("stories");
    await storage.updateOne(
      { _id: new ObjectId(storyId) },
      { $inc: { likes: 1 } }
    );
    res.redirect("/");
  } catch (error) {
    console.log("Error liking story:", error);
    if (!res.headersSent) {
      res.status(500).send("Error liking story");
    }
  }
});

app.get("/story/:id", async (req, res) => {
  try {
    const storage = dbClient.db("storyDB").collection("stories");
    const story = await storage.findOne({ _id: new ObjectId(req.params.id) });

    if (!story) {
      return res.status(404).send("Story not found");
    }

    res.render("story-detail", { story });
  } catch (error) {
    console.log("Error fetching story:", error);
    res.status(500).send("Error fetching story");
  }
});

// Start server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});