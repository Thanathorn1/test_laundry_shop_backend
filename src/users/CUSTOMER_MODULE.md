# Customer Module - On-Demand Delivery System

## Overview
โมดูลนี้จัดการข้อมูลลูกค้า (Customer) สำหรับระบบเรียกไรเดอร์รับส่งสินค้า โดยใช้ MongoDB GeoJSON format สำหรับการจัดการข้อมูลพิกัด

## Database Schemas

### 1. Customer Schema
เก็บข้อมูลลูกค้า พร้อมอยู่ที่ (Location) ในรูป GeoJSON Point
- `userId`: Reference ไปยัง User Document
- `firstName`, `lastName`: ชื่อ-นามสกุล
- `phoneNumber`: เบอร์โทรศัพท์ (สำหรับติดต่อไรเดอร์)
- `location`: GeoJSON Point [longitude, latitude] - ตำแหน่งปัจจุบันของลูกค้า
- `savedAddresses`: Array ของ addresses ที่บันทึกไว้ (Home, Work, Other)
- `averageRating`, `totalReviews`: Rating จากไรเดอร์
- `status`: 'active', 'inactive', 'suspended'
- `isEmailVerified`, `isPhoneVerified`: สถานะการยืนยัน

**Indexes:**
- `location: 2dsphere` - สำหรับ geospatial queries (หาลูกค้าใกล้พิกัด)
- `phoneNumber: 1`
- `userId: 1`

### 2. Order Schema
เก็บข้อมูลคำขอส่ง (ที่ลูกค้าสร้าง)
- `customerId`: Reference ไปยัง Customer
- `productName`, `description`: รายละเอียดสินค้า
- `images`: Array ของ images ที่ compress แล้วจาก Frontend
- `pickupLocation`: GeoJSON Point [lng, lat] - ตำแหน่งปิคอัพสินค้า
- `deliveryLocation`: GeoJSON Point [lng, lat] - ตำแหน่งส่ง (ถ้ามี)
- `status`: 'pending', 'assigned', 'picked_up', 'completed', 'cancelled'
- `riderId`: ID ของไรเดอร์ที่รับงาน (ถ้ามี)
- `totalPrice`: ราคารวม

**Indexes:**
- `pickupLocation: 2dsphere`, `deliveryLocation: 2dsphere` - หา orders ใกล้พิกัด
- `customerId: 1`, `status: 1`, `riderId: 1`

### 3. Review Schema
เก็บรีวิวและคะแนน
- `customerId`: Reference ไปยัง Customer (ผู้ให้รีวิว)
- `reviewType`: 'merchant' หรือ 'rider'
- `targetId`: ID ของ merchant/rider ที่ถูกรีวิว
- `rating`: 1-5 ดาว
- `comment`: ข้อความรีวิว
- `isAnonymous`: ส่วนตัว/ไม่ระบุตัว
- `status`: 'pending', 'approved', 'rejected'

## API Endpoints

### Authentication Guard
ทุก endpoint ต้องมี `AccessTokenGuard` (ยกเว้น GET /customers/nearby)

### 1. Register Customer
```
POST /customers/register
Body: {
  "firstName": "string",
  "lastName": "string",
  "phoneNumber": "string",
  "latitude": number,
  "longitude": number,
  "address": "string (optional)",
  "profileImage": "string (optional)"
}
Response: Customer Document
```

### 2. Get My Profile
```
GET /customers/me
Response: Customer Document with User info
```

### 3. Update Profile
```
PUT /customers/update
Body: CreateCustomerDto (partial)
Response: Updated Customer Document
```

### 4. Add Saved Address
```
POST /customers/addresses
Body: {
  "label": "Home | Work | Other",
  "address": "string",
  "latitude": number,
  "longitude": number,
  "isDefault": boolean (optional)
}
Response: Updated Customer Document
```

### 5. Find Nearby Customers (สำหรับ Rider App)
```
GET /customers/nearby
Query: {
  "latitude": number,
  "longitude": number,
  "maxDistance": number (default: 5000 meters)
}
Response: Array of nearby Customer Documents
```

### 6. Create Order
```
POST /customers/orders
Body: {
  "productName": "string",
  "description": "string (optional)",
  "images": ["url1", "url2"],
  "pickupLatitude": number,
  "pickupLongitude": number,
  "pickupAddress": "string (optional)",
  "deliveryLatitude": number (optional),
  "deliveryLongitude": number (optional),
  "deliveryAddress": "string (optional)"
}
Response: Order Document
```

### 7. Get My Orders
```
GET /customers/orders
Query: {
  "status": "pending | assigned | picked_up | completed | cancelled (optional)"
}
Response: Array of Order Documents
```

### 8. Update Order Status
```
PUT /customers/orders/:orderId/status
Body: {
  "status": "pending | assigned | picked_up | completed | cancelled"
}
Response: Updated Order Document
```

### 9. Create Review
```
POST /customers/reviews
Body: {
  "reviewType": "merchant | rider",
  "targetId": "string (optional)",
  "rating": 1-5,
  "comment": "string (optional)",
  "isAnonymous": boolean (optional)
}
Response: Review Document
```

### 10. Get My Reviews
```
GET /customers/reviews
Response: Array of Review Documents
```

## GeoJSON Format

### Location Point
```javascript
{
  "type": "Point",
  "coordinates": [longitude, latitude] // ⚠️ Note: [lng, lat] NOT [lat, lng]
}
```

### Query Nearby (MongoDB)
```javascript
db.customers.find({
  location: {
    $near: {
      $geometry: {
        type: "Point",
        coordinates: [100.5018, 13.7563] // Bangkok
      },
      $maxDistance: 5000 // เมตร
    }
  }
})
```

## Usage Example (Frontend -> Backend)

### 1. Customer Registration
```json
POST /customers/register
{
  "firstName": "สมชาย",
  "lastName": "ใจดี",
  "phoneNumber": "+66812345678",
  "latitude": 13.7563,
  "longitude": 100.5018,
  "address": "123 ถนนสาธุประดิษฐ์ กรุงเทพฯ"
}
```

### 2. Create Order (after product form submission from Frontend)
```json
POST /customers/orders
{
  "productName": "เสื้อยืดสีแดง",
  "description": "ต้องส่งถึงที่ทำงาน จันทบุรี",
  "images": ["data/compressed_image1.jpg"],
  "pickupLatitude": 13.7563,
  "pickupLongitude": 100.5018,
  "pickupAddress": "ร้านสกปรกจากเนือ",
  "deliveryLatitude": 13.7890,
  "deliveryLongitude": 100.5200,
  "deliveryAddress": "สำนักงาน XYZ"
}
```

### 3. Create Review (after order completed)
```json
POST /customers/reviews
{
  "reviewType": "rider",
  "rating": 5,
  "comment": "ไรเดอร์ดีมาก บริการเร็วและเป็นมิตร",
  "isAnonymous": false
}
```

## Security Notes

1. **GeoJSON Location Security**: ไม่เก็บ exact location ระหว่างส่วนตัว เนื่องจากอาจใช้เพื่อหาตำแหน่งจริงของลูกค้า
2. **Reverse Geocoding**: ใช้ที่ Frontend เพื่อแปลง lat/lng เป็น address ให้ผู้ใช้ตรวจสอบ
3. **Reviews Moderation**: Reviews นั้นต้อง approve ก่อนแสดง (status: 'pending' -> 'approved')
4. **Phone Verification**: ควร verify phone number ก่อนให้ไรเดอร์ติดต่อ

## MongoDB Text Indexes (Optional)

สำหรับการค้นหาด้วยตัวอักษร:
```javascript
db.customers.createIndex({ "firstName": "text", "lastName": "text" });
db.orders.createIndex({ "productName": "text", "description": "text" });
db.reviews.createIndex({ "comment": "text" });
```
