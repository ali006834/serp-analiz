const express = require("express");
const { saveScan, getScans, getScanById, deleteScan } = require("../controllers/scanController");
const authMiddleware = require("../middleware/auth");

const router = express.Router();

router.use(authMiddleware);

router.post("/", saveScan);
router.get("/", getScans);
router.get("/:id", getScanById);
router.delete("/:id", deleteScan);

module.exports = router;
