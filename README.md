Here's a comprehensive `README.md` file for your E-Health System project:

```markdown
# 🏥 E-Health System

A comprehensive electronic health record system with biometric fingerprint authentication, role-based access control, and real-time patient management capabilities.

## 📋 Table of Contents
- [Overview](#overview)
- [Features](#features)
- [Technology Stack](#technology-stack)
- [Hardware Requirements](#hardware-requirements)
- [Installation](#installation)
- [Configuration](#configuration)
- [Running the Application](#running-the-application)
- [User Roles](#user-roles)
- [API Documentation](#api-documentation)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

## 🎯 Overview

The E-Health System is a full-stack healthcare management platform that enables patients and healthcare providers to manage medical records, appointments, prescriptions, and more. The system features biometric fingerprint authentication for secure access and supports multiple user roles including patients, doctors, nurses, receptionists, diagnostic staff, and administrative personnel.

## ✨ Features

### 🔐 Authentication & Security
- Password-based login
- Fingerprint biometric authentication (USB/Serial)
- JWT token-based session management
- Role-based access control (RBAC)
- Password encryption using bcrypt
- Session timeout and secure logout

### 👥 User Management
- Patient self-registration
- Staff registration with admin approval
- Role-based dashboards (Patient, Doctor, Nurse, Receptionist, Diagnostic Staff, Pharmacist, Admin)
- Profile management with email updates
- Password change functionality

### 📋 Health Records
- Create, read, update, and delete health records
- Categorize records by type (General, Prescription, Lab Result, Imaging, Vaccination)
- File attachments for medical documents and images
- Medical image support (X-rays, MRI, CT scans)
- PDF export functionality

### 📅 Appointment Scheduling
- Schedule appointments with doctors
- View appointment calendar
- Cancel appointments
- Email notifications for appointments
- Role-based appointment management

### 💊 Prescription Management
- Create and manage prescriptions
- Track refills
- Request prescription refills
- Digital prescription records
- Medication history tracking

### 🏥 Patient Management (Staff)
- Register new patients (Receptionists)
- Admit and discharge patients (Nurses/Doctors)
- Upload diagnostic results (Diagnostic Staff)
- View patient history
- Patient status tracking

### 🔧 Administrative Features
- User verification and role assignment
- System-wide role management
- Audit logs for security tracking
- Database backup and restore
- System statistics dashboard

## 🛠 Technology Stack

### Frontend
- **React 18.2.0** - UI framework
- **React Router 6.10.0** - Navigation and routing
- **Axios 1.4.0** - HTTP client for API calls
- **React Scripts 5.0.1** - Build tooling
- **Web Vitals 3.3.1** - Performance monitoring
- **Custom CSS** - Styling and responsive design

### Backend
- **Node.js** - JavaScript runtime
- **Express.js 4.22.1** - Web framework
- **SQLite3 5.1.7** - Lightweight database
- **JSON Web Token 9.0.3** - Authentication
- **bcrypt 5.1.1** - Password hashing
- **Multer 1.4.5** - File upload handling
- **SerialPort 10.5.0** - Fingerprint sensor communication

### Hardware Integration
- **Fingerprint Sensor** (R307/AS608) - Biometric authentication
- **USB-to-Serial Converter** - Hardware communication
- **ESP32** (optional) - Bluetooth bridge for wireless sensor connection

## 💻 Hardware Requirements

### Minimum Requirements
- Computer with USB port
- Fingerprint sensor (R307 or AS608 compatible)
- USB-to-TTL converter (for direct connection)

### Optional Hardware
- ESP32 development board (for Bluetooth wireless connection)
- Arduino Uno (alternative microcontroller)

### Wiring Diagram (Direct USB Connection)
```
Fingerprint Sensor → USB-to-TTL → Computer USB
- Sensor VCC → USB 5V
- Sensor GND → USB GND
- Sensor TX → USB RX
- Sensor RX → USB TX
```

## 📦 Installation

### Prerequisites
- Node.js 18+ installed
- npm or yarn package manager
- Git (optional)

### Step 1: Clone the Repository
```bash
git clone https://github.com/yourusername/ehealth-system.git
cd ehealth-system
```

### Step 2: Install Backend Dependencies
```bash
cd backend
npm install
```

### Step 3: Install Frontend Dependencies
```bash
cd ../frontend
npm install
```

### Step 4: Set Up the Database
```bash
cd ../backend
# The database will be created automatically on first run
# To seed roles and create master admin:
node scripts/seed-roles.js
```

### Step 5: Configure Environment Variables

Create `.env` file in backend directory:
```env
# Server Configuration
NODE_ENV=development
PORT=3001
HOST=localhost

# JWT Configuration
JWT_SECRET=your-super-secret-key-change-this-in-production

# Database Configuration
DB_PATH=./database.sqlite

# Sensor Configuration (for direct USB connection)
SENSOR_PORT=COM3  # Change to your COM port
SENSOR_BAUD_RATE=57600
USE_BLUETOOTH=false  # Set to true for ESP32 Bluetooth
```

Create `.env` file in frontend directory:
```env
REACT_APP_API_URL=http://localhost:3001/api
REACT_APP_ENVIRONMENT=development
```

## 🚀 Running the Application

### Start the Backend Server
```bash
cd backend
npm run dev
# Server runs on http://localhost:3001
```

### Start the Frontend Application
```bash
cd frontend
npm start
# Application opens at http://localhost:3000
```

### One-Click Launch (Windows PowerShell)
```powershell
# Run from project root
.\start-app.ps1
```

## 👥 User Roles

### Default Login Credentials

| Role | Username | Password |
|------|----------|----------|
| **Master Admin** | `masteradmin` | `Admin@2025!` |
| **Patient** | `testuser` | `Test123!` |

### Role Capabilities

| Feature | Patient | Doctor | Nurse | Receptionist | Diagnostic Staff | Pharmacist | Admin |
|---------|---------|--------|-------|--------------|------------------|------------|-------|
| View own records | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| View all patient records | ❌ | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ |
| Create health records | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ |
| Schedule appointments | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ✅ |
| Manage appointments | ❌ | ✅ | ❌ | ✅ | ❌ | ❌ | ✅ |
| Write prescriptions | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Dispense medication | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Register patients | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ |
| Admit/Discharge patients | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Upload diagnostic results | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ |
| Manage users | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Manage roles | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| View audit logs | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

## 📡 API Documentation

### Authentication Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login/password` | Login with password |
| POST | `/api/auth/login/fingerprint` | Login with fingerprint |
| GET | `/api/auth/verify` | Verify JWT token |
| GET | `/api/auth/profile` | Get user profile |
| PUT | `/api/auth/profile` | Update user profile |
| POST | `/api/auth/change-password` | Change password |

### Health Records Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health-records` | Get user's health records |
| POST | `/api/health-records` | Create health record |
| POST | `/api/health-records/with-file` | Create record with file |
| DELETE | `/api/health-records/:id` | Delete health record |
| GET | `/api/health-records/:recordId/attachments` | Get record attachments |
| GET | `/api/health-records/attachments/:id/download` | Download attachment |

### Appointment Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/appointments` | Get appointments |
| POST | `/api/appointments` | Create appointment |
| PUT | `/api/appointments/:id` | Update appointment |
| DELETE | `/api/appointments/:id` | Cancel appointment |
| GET | `/api/appointments/available/:doctorId` | Get available slots |

### Prescription Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/prescriptions` | Get prescriptions |
| POST | `/api/prescriptions` | Create prescription |
| PUT | `/api/prescriptions/:id` | Update prescription |
| DELETE | `/api/prescriptions/:id` | Delete prescription |
| POST | `/api/prescriptions/:id/refill` | Request refill |

### Patient Management Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/patients/register` | Register new patient (receptionist) |
| GET | `/api/patients` | Get all patients |
| GET | `/api/patients/:id` | Get patient details |
| POST | `/api/admissions` | Admit patient (nurse/doctor) |
| POST | `/api/admissions/:id/discharge` | Discharge patient |
| GET | `/api/admissions/active` | Get active admissions |

### Diagnostic Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/diagnostic/upload` | Upload diagnostic file |
| GET | `/api/diagnostic/patient/:patientId` | Get patient diagnostics |

### Admin Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/master-admin/users` | Get all users |
| PUT | `/api/master-admin/users/:id/verify` | Verify user |
| PUT | `/api/master-admin/users/:id/role` | Update user role |
| DELETE | `/api/master-admin/users/:id` | Delete user |
| GET | `/api/master-admin/statistics` | Get system statistics |
| GET | `/api/master-admin/role-requests` | Get role requests |
| POST | `/api/master-admin/role-requests/:id/approve` | Approve role request |
| POST | `/api/master-admin/roles` | Create role |
| PUT | `/api/master-admin/roles/:id` | Update role |
| DELETE | `/api/master-admin/roles/:id` | Delete role |

## 🔧 Fingerprint Sensor Setup

### Direct USB Connection
1. Connect fingerprint sensor via USB-to-TTL converter
2. Install USB-to-Serial driver (CP2102 or CH340)
3. Find COM port in Device Manager
4. Update `SENSOR_PORT` in `.env` file

### ESP32 Bluetooth Connection
1. Upload ESP32 firmware to the board
2. Power the ESP32
3. In the web app, click "Connect Bluetooth Sensor"
4. Select "E-Health Fingerprint" from the list

### Testing the Sensor
```bash
# Run sensor test script
cd backend
node scripts/testSensor.js
```

## 🐛 Troubleshooting

### Backend Won't Start

**Issue:** Port 3001 already in use
```bash
# Find process using port
netstat -ano | findstr :3001
# Kill the process
taskkill /PID <PID> /F
```

**Issue:** Database locked
```bash
# Delete and recreate database
rm ehealth.db
npm run dev
```

### Fingerprint Sensor Not Detected

**Windows:**
1. Check Device Manager for COM port
2. Install USB-to-Serial drivers
3. Update `.env` with correct COM port

**Linux:**
```bash
# Check USB devices
ls /dev/ttyUSB*
# Add user to dialout group
sudo usermod -a -G dialout $USER
```

### Web Bluetooth Not Working

1. Use Chrome or Edge browser (Firefox/Safari not supported)
2. Enable Web Bluetooth: `chrome://flags/#enable-web-bluetooth`
3. Ensure Bluetooth is enabled in Windows settings

### Common Error Messages

| Error | Solution |
|-------|----------|
| `401 Unauthorized` | Login again or check JWT token |
| `SQLITE_ERROR: table not found` | Delete database and restart server |
| `Cannot find module 'X'` | Run `npm install` in the directory |
| `Port already open` | Restart application or kill Node processes |

## 📊 Database Schema

### Users Table
| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| username | TEXT | Unique username |
| password_hash | TEXT | Hashed password |
| email | TEXT | User email |
| role | TEXT | User role |
| verification_status | TEXT | pending/approved/rejected |
| health_record_id | TEXT | Unique health record identifier |

### Health Records Table
| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| user_id | INTEGER | Foreign key to users |
| record_data | TEXT | JSON record data |
| created_at | DATETIME | Creation timestamp |

### Appointments Table
| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| patient_id | INTEGER | Foreign key to users |
| doctor_id | INTEGER | Foreign key to users |
| title | TEXT | Appointment title |
| appointment_date | TEXT | Date of appointment |
| appointment_time | TEXT | Time of appointment |
| status | TEXT | scheduled/completed/cancelled |

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Adafruit for the fingerprint sensor library
- Express.js community for the excellent framework
- React team for the amazing UI library
- All contributors and testers

## 📞 Support

For issues and questions:
- GitHub Issues: [github.com/yourusername/ehealth-system/issues](https://github.com/yourusername/ehealth-system/issues)
- Email: support@ehealth-system.com
- Documentation: [docs.ehealth-system.com](https://docs.ehealth-system.com)

---

**Built with ❤️ for better healthcare management**
```

This README provides comprehensive documentation for your E-Health System, including setup instructions, API documentation, troubleshooting guides, and feature overviews. Customize the repository URLs, email addresses, and any other placeholders as needed! 🚀
