# Dealership Web App — Database Schema

---

## BUSINESS_LOG
Tracks all system activity for auditing purposes.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `log_id` | INT | PK, AUTO_INCREMENT | |
| `user_id` | INT | FK → USERS | Who performed the action |
| `message` | TEXT | NOT NULL | Description of the action |
| `record_id` | INT | | ID of the affected record |
| `timestamp` | TIMESTAMP | DEFAULT NOW() | When it occurred |

---

## SALES_FORMS
Records every vehicle sale transaction.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `sale_id` | INT | PK, AUTO_INCREMENT | |
| `VIN` | VARCHAR(17) | FK → VEHICLES | Vehicle sold |
| `customer_id` | INT | FK → CUSTOMERS | Buyer |
| `salesman_id` | INT | FK → USERS | Sales rep who closed the deal |
| `amount_sold` | DECIMAL(10,2) | NOT NULL | Final sale price |
| `status` | ENUM('Pending','Finalized') | DEFAULT 'Pending' | |
| `date_time` | TIMESTAMP | DEFAULT NOW() | Date and time of sale |
| `notes` | TEXT | | Additional details |

---

## CUSTOMER_RECORDS
Stores information about dealership customers.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `customer_id` | INT | PK, AUTO_INCREMENT | CID on whiteboard |
| `phone` | VARCHAR(20) | | |
| `customer_name` | VARCHAR(255) | NOT NULL | |
| `amount_owed` | DECIMAL(10,2) | DEFAULT 0.00 | Outstanding balance |
| `VIN` | VARCHAR(17) | FK → VEHICLES | Most recent vehicle linked |

---

## USERS
Stores login credentials and roles for all system users.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `user_id` | INT | PK, AUTO_INCREMENT | |
| `username` | VARCHAR(100) | NOT NULL, UNIQUE | |
| `password` | VARCHAR(255) | NOT NULL | Store as a hash, never plaintext |
| `role` | ENUM('Admin','Sales Rep') | NOT NULL | Controls access permissions |

---

## VEHICLE_INVENTORY
The master list of all vehicles at the dealership.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `VIN` | VARCHAR(17) | PK | Globally unique vehicle identifier |
| `model` | VARCHAR(100) | NOT NULL | |
| `awaiting_pricing` | BOOLEAN | DEFAULT FALSE | Flag for vehicles needing a price set |
| `year` | YEAR | NOT NULL | |
| `listed_sale` | DECIMAL(10,2) | | Asking price shown to customers |
| `mileage` | INT | | |
| `color` | VARCHAR(50) | | |
| `comments` | TEXT | | Internal notes |
| `status` | ENUM('Available','On The Way','Sold','Pending') | DEFAULT 'Available' | |

---

## ACQUISITION_FORMS
Records vehicles acquired by the dealership (purchases, trade-ins, etc).

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `acquisition_id` | INT | PK, AUTO_INCREMENT | |
| `VIN` | VARCHAR(17) | FK → VEHICLES | Vehicle being acquired |
| `purchase_price` | DECIMAL(10,2) | NOT NULL | Amount the dealership paid |
| `status` | ENUM('Pending','Approved') | DEFAULT 'Pending' | |
| `salesman_id` | INT | FK → USERS | Rep who handled the acquisition |
| `notes` | TEXT | | |
| `created_at` | TIMESTAMP | DEFAULT NOW() | |

---

## Relationships

| Relationship | Type | Description |
|---|---|---|
| USERS → SALES_FORMS | One-to-Many | A salesman handles many sales |
| USERS → ACQUISITION_FORMS | One-to-Many | A salesman handles many acquisitions |
| USERS → BUSINESS_LOG | One-to-Many | A user generates many log entries |
| CUSTOMERS → SALES_FORMS | One-to-Many | A customer can make multiple purchases |
| VEHICLES → SALES_FORMS | One-to-One | A vehicle is sold once |
| VEHICLES → ACQUISITION_FORMS | One-to-One | A vehicle is acquired once |

---

## Notes & Recommendations

- **Passwords** must be hashed (e.g. bcrypt) before storing — never save plaintext.
- **`awaiting_pricing`** on VEHICLES is a boolean flag; when `TRUE`, the vehicle should be blocked from appearing in public listings until a `listed_sale` price is set.
- **`amount_owed`** on CUSTOMERS could be calculated dynamically from SALES_FORMS instead of stored directly, to avoid data getting out of sync.
- **`VIN` on CUSTOMERS** creates a direct link to one vehicle — consider whether a customer can ever buy more than one car and if so, let SALES_FORMS handle that relationship instead.
- All tables should have `created_at` timestamps for sorting and audit purposes.
