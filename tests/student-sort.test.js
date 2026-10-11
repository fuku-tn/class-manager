import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SORTS, SORT_KEYS, isSortKey, givenName, sortRows } from '../public/js/student-sort.mjs';

const rows = [
  { student_code: 'P.3', full_name: 'Nguyễn Văn Bình', attendance_rate: 0.5, absent: 3, course_status: 'dropped' },
  { student_code: 'P.1', full_name: 'Trần Thị An', attendance_rate: 1, absent: 0, course_status: 'active' },
  { student_code: 'P.2', full_name: 'Lê Hoàng Chi', attendance_rate: null, absent: 1, course_status: 'active' },
  { student_code: 'P.10', full_name: 'Phạm Đức Dũng', attendance_rate: 0.75, absent: 2, course_status: 'deferred' },
];
const names = (key) => sortRows(rows, key).map((r) => r.full_name.split(' ').pop());

test('student-sort: tên (từ cuối) theo bảng chữ cái tiếng Việt, hai chiều', () => {
  assert.equal(givenName('  Nguyễn Văn   An '), 'An');
  assert.deepEqual(names('given_asc'), ['An', 'Bình', 'Chi', 'Dũng']);
  assert.deepEqual(names('given_desc'), ['Dũng', 'Chi', 'Bình', 'An']);
});

test('student-sort: họ tên, mã (số tự nhiên: P.2 trước P.10)', () => {
  assert.deepEqual(sortRows(rows, 'name_asc').map((r) => r.student_code), ['P.2', 'P.3', 'P.10', 'P.1']);
  assert.deepEqual(sortRows(rows, 'code_asc').map((r) => r.student_code), ['P.1', 'P.2', 'P.3', 'P.10']);
  assert.deepEqual(sortRows(rows, 'code_desc').map((r) => r.student_code), ['P.10', 'P.3', 'P.2', 'P.1']);
});

test('student-sort: tỉ lệ trống luôn ở cuối, vắng nhiều nhất, trạng thái', () => {
  assert.deepEqual(names('rate_asc'), ['Bình', 'Dũng', 'An', 'Chi']);
  assert.deepEqual(names('rate_desc'), ['An', 'Dũng', 'Bình', 'Chi']);
  assert.deepEqual(names('absent_desc'), ['Bình', 'Dũng', 'Chi', 'An']);
  assert.deepEqual(sortRows(rows, 'status').map((r) => r.course_status), ['active', 'active', 'deferred', 'dropped']);
});

test('student-sort: không đổi mảng gốc; mặc định/khóa lạ giữ thứ tự; danh sách khóa hợp lệ', () => {
  const before = rows.map((r) => r.student_code).join();
  sortRows(rows, 'rate_asc');
  assert.equal(rows.map((r) => r.student_code).join(), before);
  assert.deepEqual(sortRows(rows, 'default'), rows);
  assert.deepEqual(sortRows(rows, 'khong-co'), rows);
  assert.ok(isSortKey('rate_asc') && !isSortKey('x'));
  assert.equal(SORT_KEYS.length, SORTS.length);
  assert.ok(SORTS.length >= 8, 'nhiều cách sắp xếp');
});
