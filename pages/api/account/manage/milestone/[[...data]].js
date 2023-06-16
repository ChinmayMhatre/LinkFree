import { authOptions } from "../../../auth/[...nextauth]";
import { getServerSession } from "next-auth/next";
import { ObjectId } from "bson";

import connectMongo from "@config/mongo";
import logger from "@config/logger";
import Profile from "@models/Profile";

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    res.status(401).json({ message: "You must be logged in." });
    return;
  }
  const username = session.username;
  if (!["GET", "PUT"].includes(req.method)) {
    return res
      .status(400)
      .json({ error: "Invalid request: GET or PUT required" });
  }

  const { data } = req.query;
  let milestone = {};
  if (req.method === "GET") {
    milestone = await getMilestoneApi(username, data[0]);
  }
  if (req.method === "PUT") {
    if (data?.length && data[0]) {
      milestone = await updateMilstoneApi(username, data[0], req.body);
    } else {
      milestone = await addMilstoneApi(username, req.body);
    }
  }

  if (milestone.error) {
    return res.status(404).json({ message: milestone.error });
  }
  return res.status(200).json(milestone);
}

export async function getMilestoneApi(username, id) {
  await connectMongo();
  const log = logger.child({ username });
  const getMilestone = await Profile.aggregate([
    {
      $match: {
        username,
      },
    },
    {
      $unwind: "$milestones",
    },
    {
      $match: {
        "milestones._id": new ObjectId(id),
      },
    },
    {
      $replaceRoot: {
        newRoot: "$milestones",
      },
    },
  ]);

  if (!getMilestone) {
    log.info(`milestone not found for username: ${username}`);
    return { error: "Milestone not found." };
  }

  return JSON.parse(JSON.stringify(getMilestone[0]));
}

export async function updateMilstoneApi(username, id, milestone) {
  await connectMongo();
  const log = logger.child({ username });

  let getMilestone = {};
  try {
    getMilestone = await Profile.findOneAndUpdate(
      {
        username,
        "milestones._id": new ObjectId(id),
      },
      {
        $set: {
          source: "database",
          "milestones.$": milestone,
        },
      },
      { upsert: true }
    );
  } catch (e) {
    log.error(e, `failed to update milestone for username: ${username}`);
  }

  return JSON.parse(JSON.stringify(getMilestone));
}

export async function addMilstoneApi(username, milestone) {
  await connectMongo();
  const log = logger.child({ username });
  let getMilestone = {};
  try {
    getMilestone = await Profile.findOneAndUpdate(
      {
        username,
      },
      {
        $push: { milestones: milestone },
      },
      { upsert: true }
    );
  } catch (e) {
    log.error(e, `failed to update milestone for username: ${username}`);
  }

  return JSON.parse(JSON.stringify(getMilestone));
}
