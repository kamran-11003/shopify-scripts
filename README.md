# Visitor Email Server

A simple Node.js server that sends welcome emails to new visitors using Nodemailer and Gmail SMTP.

## Features

- ✅ Send welcome emails to new visitors
- ✅ Gmail SMTP integration
- ✅ Beautiful HTML email templates
- ✅ Shopify shop data integration
- ✅ RESTful API endpoints
- ✅ Error handling and validation
- ✅ CORS support

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Environment Configuration:**
   The server uses the following environment variables (already configured in `env.local`):
   ```
   MAIL_USERNAME=kamranchohan740@gmail.com
   MAIL_PASSWORD=oozt jwuw eykh rbdj
   MAIL_FROM=kamranchohan740@gmail.com
   MAIL_PORT=587
   MAIL_SERVER=smtp.gmail.com
   PORT=3000
   ```

3. **Start the server:**
   ```bash
   # Development mode (with auto-restart)
   npm run dev
   
   # Production mode
   npm start
   ```

## API Endpoints

### GET `/`
Get server information and available endpoints.

**Response:**
```json
{
  "message": "Visitor Email Server is running!",
  "shop": "buzzbit-test-store",
  "domain": "buzzbit-test-store.myshopify.com",
  "endpoints": {
    "POST /visitor": "Register a new visitor and send welcome email",
    "GET /shop": "Get shop information",
    "GET /health": "Health check"
  }
}
```

### GET `/health`
Health check endpoint.

**Response:**
```json
{
  "status": "OK",
  "timestamp": "2025-01-27T10:30:00.000Z"
}
```

### GET `/shop`
Get shop information.

**Response:**
```json
{
  "shop_name": "buzzbit-test-store",
  "domain": "buzzbit-test-store.myshopify.com",
  "email": "hammadzahid254@gmail.com",
  "country": "PK",
  "currency": "PKR",
  "is_active": true
}
```

### POST `/visitor`
Register a new visitor and send welcome email.

**Request Body:**
```json
{
  "email": "visitor@example.com",
  "name": "John Doe",
  "phone": "+1234567890",
  "message": "Optional message"
}
```

**Required Fields:**
- `email` (string): Visitor's email address

**Optional Fields:**
- `name` (string): Visitor's name
- `phone` (string): Visitor's phone number
- `message` (string): Additional message

**Response (Success):**
```json
{
  "success": true,
  "message": "Welcome email sent successfully!",
  "visitor": {
    "email": "visitor@example.com",
    "name": "John Doe",
    "timestamp": "2025-01-27T10:30:00.000Z"
  },
  "email_info": {
    "messageId": "<unique-message-id>",
    "accepted": ["visitor@example.com"],
    "rejected": []
  }
}
```

**Response (Error):**
```json
{
  "success": false,
  "message": "Email is required"
}
```

## Usage Examples

### Using curl:
```bash
# Send welcome email to a new visitor
curl -X POST http://localhost:3000/visitor \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newvisitor@example.com",
    "name": "Jane Smith"
  }'
```

### Using JavaScript (fetch):
```javascript
const response = await fetch('http://localhost:3000/visitor', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    email: 'newvisitor@example.com',
    name: 'Jane Smith',
    phone: '+1234567890'
  })
});

const result = await response.json();
console.log(result);
```

## Email Template

The server sends a beautifully formatted HTML email that includes:
- Welcome message
- Shop information
- Store link
- Contact information
- Professional styling

## Error Handling

The server includes comprehensive error handling for:
- Invalid email formats
- Missing required fields
- SMTP connection issues
- Email sending failures

## Shop Data Integration

The server is pre-configured with your Shopify shop data:
- **Shop Name:** buzzbit-test-store
- **Domain:** buzzbit-test-store.myshopify.com
- **Email:** hammadzahid254@gmail.com
- **Country:** PK
- **Currency:** PKR

## Development

- **Port:** 3000 (configurable via PORT environment variable)
- **Auto-restart:** Use `npm run dev` for development
- **Logging:** All email sending activities are logged to console

## Security Notes

- Gmail app password is used for authentication
- CORS is enabled for cross-origin requests
- Input validation is implemented for email addresses
- Error messages don't expose sensitive information



