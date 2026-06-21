import React from 'react';

const StaffSalary = () => {
  // user not required yet; avoid unused variable warning
  return (
    <div className="p-4 sm:p-6">
      <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Staff Salary</h1>
      <p className="mt-3 text-sm text-gray-600">This page is a placeholder for staff salary management.</p>

      <div className="mt-6 bg-white border rounded-lg p-4">
        <div className="text-sm text-gray-700">No salary records to display yet.</div>
      </div>
    </div>
  );
};

export default StaffSalary;
