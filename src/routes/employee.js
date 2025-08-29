const router = require("express").Router();
const { createEmployeesBulk,  getAllEmployees,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  deleteEmployeesBulk,
  getAllAids
 } = require("../controllers/employee");
const { requireAuth } = require("../middlewares/auth");


router.get("/",requireAuth, getAllEmployees);
router.get("/aids",requireAuth,getAllAids);
router.post("/add",requireAuth, createEmployee);
router.post("/bulk",requireAuth,createEmployeesBulk)
router.put("/:id",requireAuth, updateEmployee);
router.delete("/:id",requireAuth,deleteEmployee)
router.post("/bulk-delete",requireAuth, deleteEmployeesBulk);


module.exports = router;
