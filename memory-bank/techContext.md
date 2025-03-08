# Technical Context

## Technologies Used

### Frontend
- **React (18.x)**: UI component library
- **Next.js (14.x)**: React framework for server-side rendering, static site generation, and API routes
- **TypeScript (5.x)**: Typed JavaScript for improved development experience
- **Tailwind CSS**: Utility-first CSS framework for styling
- **shadcn/ui**: Component library based on Radix UI and Tailwind
- **Lucide React**: Icon library
- **React Context API**: State management solution

### Backend
- **Next.js API Routes**: Serverless API endpoints
- **Firebase Authentication**: User authentication and session management
- **AWS DynamoDB**: Primary NoSQL database solution with Global Secondary Indexes
- **AWS SDK for JavaScript**: Server-side AWS service integration

### Infrastructure & Deployment
- **Vercel**: Hosting and deployment platform
- **GitHub**: Version control and CI/CD
- **Environment Variables**: Configuration management for different environments

### Planned Technologies
- **Socket.io**: For real-time updates
- **WebRTC**: For video/audio communication
- **Firebase Cloud Functions**: For background processing
- **AI Services**: For meeting transcription, translation, and summaries

## Development Setup

### Environment Variables
The application requires the following environment variables:

```
# AWS Configuration
AWS_REGION=us-east-2
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx

# Firebase Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=xxx
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=xxx
NEXT_PUBLIC_FIREBASE_PROJECT_ID=xxx
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=xxx
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=xxx
NEXT_PUBLIC_FIREBASE_APP_ID=xxx

# Firebase Admin (Server-side)
FIREBASE_CLIENT_EMAIL=xxx
FIREBASE_PRIVATE_KEY=xxx
```

### Local Development
1. Install dependencies: `npm install`
2. Run development server: `npm run dev`
3. Build for production: `npm run build`
4. Start production server: `npm start`

### Project Structure
- `/src`: Main application code
  - `/app`: Next.js app router pages and layouts
  - `/components`: React components
  - `/contexts`: React context providers
  - `/hooks`: Custom React hooks
  - `/lib`: Utility functions and API clients
  - `/pages/api`: API routes
  - `/providers`: Provider components
  - `/types`: TypeScript type definitions
- `/public`: Static assets
- `/docs`: Documentation and Architecture Decision Records (ADRs)

## Technical Constraints

### Platform Compatibility
- **Browser Support**: Modern browsers (Chrome, Firefox, Safari, Edge)
- **Responsive Design**: Mobile-first approach
- **Accessibility**: WCAG 2.1, Level AA compliance goal

### Performance Targets
- **Page Load**: < 2 seconds initial load
- **Time to Interactive**: < 3 seconds
- **Real-time Latency**: < 100ms for real-time updates

### Security Requirements
- **Authentication**: JWT-based authentication
- **Data Encryption**: HTTPS for all communications
- **Authorization**: Role-based access control (admin vs. member)
- **Data Isolation**: Company-based data partitioning

### Scalability Considerations
- **User Base**: Support for 100-1000+ concurrent users
- **Data Volume**: Efficient storage and retrieval with indexing strategies
- **Connection Management**: Optimize WebSocket connections for real-time features

## Dependencies

### Core Dependencies
```json
{
  "dependencies": {
    "@radix-ui/react-avatar": "^1.0.4",
    "@radix-ui/react-dialog": "^1.0.5",
    "@radix-ui/react-dropdown-menu": "^2.0.6",
    "@radix-ui/react-hover-card": "^1.0.7",
    "@radix-ui/react-popover": "^1.0.7",
    "@radix-ui/react-scroll-area": "^1.0.5",
    "@radix-ui/react-separator": "^1.0.3",
    "@radix-ui/react-slot": "^1.0.2",
    "@radix-ui/react-switch": "^1.0.3",
    "@radix-ui/react-tabs": "^1.0.4",
    "@radix-ui/react-tooltip": "^1.0.7",
    "aws-sdk": "^2.1571.0",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.0",
    "firebase": "^10.8.0",
    "lucide-react": "^0.325.0",
    "next": "14.1.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "tailwind-merge": "^2.2.0",
    "tailwindcss-animate": "^1.0.7"
  },
  "devDependencies": {
    "@types/node": "^20.11.17",
    "@types/react": "^18.2.45",
    "@types/react-dom": "^18.2.18",
    "autoprefixer": "^10.4.17",
    "eslint": "^8.56.0",
    "eslint-config-next": "14.1.0",
    "postcss": "^8.4.35",
    "tailwindcss": "^3.4.1",
    "typescript": "^5.3.3"
  }
}
```

### Development Tooling
- **TypeScript**: Type checking
- **ESLint**: Code quality and style enforcement
- **Prettier**: Code formatting (via ESLint configuration)
- **Tailwind CSS**: Utility-first CSS
- **PostCSS**: CSS processing

## Integration Points

### External Services
- **Firebase Authentication**: User login and session management
- **AWS DynamoDB**: Database operations (current)
- **Firebase Firestore**: Future database operations

### Internal APIs
- REST API endpoints under `/api` routes:
  - `/api/auth`: Authentication operations
  - `/api/companies`: Company management
  - `/api/users`: User management

### Browser APIs
- **WebRTC**: For peer-to-peer audio/video (planned)
- **Web Notifications**: For system notifications (planned)
- **LocalStorage**: For client-side persistence of user preferences

## Migration Plan

### AWS DynamoDB to Firebase Firestore
1. Create equivalent Firestore collections for DynamoDB tables
2. Implement dual-write strategy during transition
3. Add read fallbacks to ensure data availability
4. Validate data consistency between systems
5. Switch reads to Firestore
6. Remove DynamoDB dependencies

The technical architecture provides a foundation for building a scalable, real-time virtual office experience while allowing for planned migrations and future AI feature integration.
