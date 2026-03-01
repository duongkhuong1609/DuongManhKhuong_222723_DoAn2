

## Tổng Quan Hệ Thống

Hệ thống này là nền tảng quản lý lịch học tập trung, được thiết kế để:

- **Quản lý dữ liệu tập trung**: Lưu trữ thông tin giảng viên, phòng học, môn học, và lịch dạy
- **Cung cấp API đầy đủ**: Cho phép các thuật toán bên ngoài (bao gồm thuật toán tiến hóa) truy cập và xử lý dữ liệu
- **Hỗ trợ tối ưu hóa**: Lịch học có thể được tối ưu hóa bằng các thuật toán tiến hóa để tìm giải pháp tốt nhất

---

## Cơ Sở Dữ Liệu Trực Quan

### 7 Models Chính

| Model | Mục Đích | Trường Quan Trọng |
|-------|---------|------------------|
| **Semester** | Kỳ học | code, name, startDate, endDate, isActive |
| **Instructor** | Giảng viên | code, name, email, teachingNotes, maxHoursPerWeek |
| **Room** | Phòng học | code, building, capacity, type |
| **Course** | Môn học | code, name, department, credits |
| **Timeslot** | Tiết học | code, startTime, endTime, period |
| **Class** | Lớp học | code, courseId, instructorId, semesterId |
| **Schedule** | Lịch dạy | classId, roomId, timeslotId, dayOfWeek |

### Sơ Đồ Quan Hệ

```
Semester (kỳ học)
  ├─ Class (lớp học)
  │   ├─ Course (môn học)
  │   └─ Instructor (giảng viên)
  │       └─ teachingNotes (sở thích dạy)
  │
  └─ Schedule (lịch dạy)
      ├─ Room (phòng học)
      ├─ Timeslot (tiết học)
      └─ Class (lớp học)
```

---

## Khả Năng Tương Thích Thuật Toán Tiến Hóa

Hệ thống được thiết kế để hỗ trợ các thuật toán tiến hóa tối ưu hóa lịch học:

### 1. **Dữ Liệu Đầu Vào (Constraints & Inputs)**
- Danh sách lớp học, giảng viên, phòng, tiết học
- Giới hạn: giờ dạy tối đa, sở thích dạy của giảng viên
- Thời gian có sẵn (các tiết học khả dụng)

### 2. **Biểu Diễn Cá Thể (Individual/Chromosome)**
- Mỗi cá thể đại diện cho một lịch học hoàn chỉnh
- Gen = (ClassID, RoomID, TimeslotID, DayOfWeek)

### 3. **Hàm Đánh Giá (Fitness Function)**
Đánh giá chất lượng lịch học dựa trên:
- Không có xung đột thời gian
- Không vượt giờ dạy tối đa của giảng viên
- Sứ dụng phòng phù hợp với sức chứa lớp
- Tôn trọng sở thích dạy của giảng viên

### 4. **API Hỗ Trợ**
- `GET /api/classes` - Lấy danh sách lớp cần xếp lịch
- `GET /api/instructors` - Lấy thông tin giảng viên (giờ max, sở thích)
- `GET /api/rooms` - Lấy danh sách phòng với sức chứa
- `GET /api/timeslots` - Lấy danh sách tiết học
- `GET /api/schedules` - Lấy lịch hiện tại
- `POST /api/schedules` - Lưu lịch được tối ưu
...
.....

## Database maintenance scripts

Có hai script tiện ích nằm trong thư mục `scripts/`:

* `setup-database.js` – tạo những bảng mới (`Semester`, `Instructor`, `Course`, `Room`, `Class`) nếu chúng chưa tồn tại.
* `drop-new-tables.js` – xóa các bảng này **một cách an toàn**. Script sẽ gỡ trước mọi ràng buộc khóa ngoại tham chiếu tới bảng rồi mới xóa bảng, vì vậy các bảng "cũ" khác của bạn sẽ không bị hỏng. Chạy bằng:

```powershell
node scripts\drop-new-tables.js
```

Các bảng không tồn tại sẽ bị bỏ qua và script in ra thông báo những gì đã được xử lý.

Sử dụng khi bạn muốn cơ sở dữ liệu chỉ giữ lại các bảng cũ hơn, không dùng schema mới.

Dưới đây là **phần mô tả CSDL để đưa vào README**, đã bỏ hoàn toàn kiểu dữ liệu như bạn yêu cầu.

---

# 🗄️ Thiết kế Cơ sở dữ liệu (Database Design)

Hệ thống được xây dựng nhằm quản lý phân công giảng dạy, học kỳ, môn học và nguyện vọng của giảng viên trong trường đại học.

---

# 1️⃣ Tổng quan

Cơ sở dữ liệu gồm các nhóm chức năng chính:

* Quản lý khoa – ngành – môn học
* Quản lý giảng viên và tài khoản
* Quản lý lớp và lịch dạy
* Quản lý phòng học
* Quản lý học kỳ
* Quản lý nguyện vọng giảng viên

---

# 2️⃣ Danh sách bảng

---

## 🔹 KHOA

Quản lý thông tin khoa.

* MaKhoa (PK)
* TenKhoa

---

## 🔹 NGANH

Quản lý ngành thuộc khoa.

* MaNganh (PK)
* MaKhoa (FK)
* TenNganh

---

## 🔹 MON

Quản lý thông tin môn học.

* MaMon (PK)
* MaNganh (FK)
* TenMon
* SoTinChi
* SoTiet
* LoaiMon
* HocKy
* Nam

---

## 🔹 HOC_KY

Quản lý thông tin học kỳ.

* MaHK (PK)
* TenHK
* TrangThai
* TuNgay
* DenNgay
* NamHK

---

## 🔹 HOC_KY_CAC_MON

Liên kết giữa học kỳ và môn học.

* MaHK (FK)
* MaMon (FK)

---

## 🔹 GIANG_VIEN

Quản lý thông tin giảng viên.

* MaGV (PK)
* MaTK (FK)
* MaKhoa (FK)
* TenGV
* EmailGV
* ChucVu
* TrangThai

---

## 🔹 TAI_KHOAN

Quản lý tài khoản đăng nhập.

* MaTK (PK)
* MaGV (FK)
* TenTK
* MatKhau
* EmailTK
* Quyen

---

## 🔹 CHUYEN_MON_CUA_GV

Liên kết giữa giảng viên và môn học (many-to-many).

* MaGV (FK)
* MaMon (FK)

---

## 🔹 LOP

Quản lý thông tin lớp học.

* MaLop (PK)
* MaNganh (FK)
* TenLop
* Nam

---

## 🔹 LICH_DAY

Quản lý lịch giảng dạy.

* MaLD (PK)
* MaLop (FK)
* MaPhong (FK)
* MaGV (FK)
* MaMon (FK)
* NgayDay
* SoTietDay
* TrangThai
* HocKyDay
* Buoi

---

## 🔹 KHU

Quản lý khu học.

* MaKhu (PK)
* TenKhu
* MoTa

---

## 🔹 PHONG

Quản lý phòng học.

* MaPhong (PK)
* MaKhu (FK)
* TenPhong
* LoaiPhong
* TrangThai

---

## 🔹 NGUYEN_VONG_THOI_GIAN

Nguyện vọng giảng dạy theo thời gian.

* MaNVG (PK)
* MaGV (FK)
* ThuTrongTuan
* TietDay
* MucDoUuTien

---

## 🔹 NGUYEN_VONG_KHAC

Nguyện vọng khác của giảng viên.

* MaNVK (PK)
* MaGV (FK)
* LoaiNV
* GiaTri

---

# 3️⃣ Các mối quan hệ chính

* 1 Khoa → N Ngành
* 1 Ngành → N Môn
* 1 Giảng viên → N Lịch dạy
* 1 Môn → N Lịch dạy
* 1 Phòng → N Lịch dạy
* Giảng viên ↔ Môn (many-to-many)
* Học kỳ ↔ Môn (many-to-many)

---


