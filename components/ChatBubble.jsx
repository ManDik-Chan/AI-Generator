import React from 'react';
import { MessageSquare, User } from 'lucide-react';

const ChatMessage = ({ message, isUser, avatar }) => {
  return (
    <div className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : ''} mb-4`}>
      {/* Avatar Container */}
      <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
        {avatar ? (
          <img
            src={avatar}
            alt={isUser ? "User Avatar" : "Assistant Avatar"}
            className="w-full h-full object-cover"
          />
        ) : (
          isUser ? (
            <User className="w-6 h-6 text-gray-600" />
          ) : (
            <MessageSquare className="w-6 h-6 text-blue-600" />
          )
        )}
      </div>

      {/* Message Content */}
      <div className={`max-w-[70%] ${isUser ? 'items-end' : 'items-start'}`}>
        {/* Message Bubble */}
        <div
          className={`
            px-4 py-2 rounded-2xl 
            ${isUser ? 
              'bg-blue-500 text-white rounded-tr-none' : 
              'bg-gray-100 text-gray-800 rounded-tl-none'
            }
          `}
        >
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        </div>

        {/* Timestamp - using a mock time for demo */}
        <span className={`
          text-xs text-gray-400 mt-1 block
          ${isUser ? 'text-right' : 'text-left'}
        `}>
          {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>
  );
};

const TypingIndicator = () => {
  return (
    <div className="flex items-center space-x-2 mb-4">
      <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
        <MessageSquare className="w-6 h-6 text-blue-600" />
      </div>
      <div className="px-4 py-2 rounded-2xl bg-gray-100 rounded-tl-none">
        <div className="flex space-x-1">
          <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{animationDelay: '0ms'}} />
          <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{animationDelay: '150ms'}} />
          <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{animationDelay: '300ms'}} />
        </div>
      </div>
    </div>
  );
};

const ChatBubble = ({ messages, avatars, isTyping = false }) => {
  return (
    <div className="flex flex-col p-4 h-full overflow-y-auto bg-white">
      <div className="flex-1 space-y-4">
        {messages.map((message, index) => (
          <ChatMessage
            key={index}
            message={message}
            isUser={message.role === 'user'}
            avatar={message.role === 'user' ? avatars.user : avatars.assistant}
          />
        ))}
        {isTyping && <TypingIndicator />}
      </div>
    </div>
  );
};

export default ChatBubble;