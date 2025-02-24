// components/dashboard/message-feed.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"

interface Message {
  id: string
  author: {
    name: string
    role: string
    avatar: string
  }
  content: string
  timestamp: string
  type: 'announcement' | 'update' | 'alert'
}

const demoMessages: Message[] = [
  {
    id: '1',
    author: {
      name: 'Sarah Johnson',
      role: 'CEO',
      avatar: '/api/placeholder/32/32'
    },
    content: 'All-hands meeting tomorrow at 10 AM in the Main Conference Room',
    timestamp: '2h ago',
    type: 'announcement'
  },
  {
    id: '2',
    author: {
      name: 'HR Team',
      role: 'Human Resources',
      avatar: '/api/placeholder/32/32'
    },
    content: 'Remember to complete your quarterly reviews by end of week',
    timestamp: '4h ago',
    type: 'alert'
  }
]

export function MessageFeed() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Company Updates</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {demoMessages.map(message => (
            <div key={message.id} className="flex items-start space-x-4">
              <Avatar>
                <AvatarImage src={message.author.avatar} />
                <AvatarFallback>{message.author.name.slice(0, 2)}</AvatarFallback>
              </Avatar>
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <span className="font-medium">{message.author.name}</span>
                  <Badge variant="outline">{message.author.role}</Badge>
                  <span className="text-sm text-gray-500">{message.timestamp}</span>
                </div>
                <p className="text-sm text-gray-700">{message.content}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}