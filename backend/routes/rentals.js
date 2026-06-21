const express = require('express');
const router = express.Router();
const {
  getAllRentals,
  getRental,
  createRental,
  updateRental,
  deleteRental,
  getRentalStats
} = require('../controllers/rentalController');
const { protect, authorize, checkDateRestriction, blockEmployee } = require('../middleware/auth');

router.use(protect);
router.use(blockEmployee);

router.get('/stats', getRentalStats);
router.get('/', getAllRentals);
router.get('/:id', getRental);
router.post('/', checkDateRestriction, createRental);
router.put('/:id', authorize('super_admin'), updateRental);
router.delete('/:id', authorize('super_admin'), deleteRental);

module.exports = router;
