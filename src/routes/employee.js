const router = require("express").Router();
const { createEmployeesBulk,  getAllEmployees,
  createEmployee,
  updateEmployee,
  deleteEmployee,
 } = require("../controllers/employee");


router.get("/", getAllEmployees);
router.post("/add", createEmployee);
router.post("/bulk",createEmployeesBulk)
router.put("/:id", updateEmployee);
router.delete("/:id",deleteEmployee)

module.exports = router;
