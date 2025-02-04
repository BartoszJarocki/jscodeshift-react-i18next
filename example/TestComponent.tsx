import React from 'react';

interface User {
  name: string;
  role: string;
  notifications: number;
}

const user: User = {
  name: 'John Doe',
  role: 'Admin',
  notifications: 5,
};

const formatDate = (date: Date) => date.toLocaleDateString();
const currentDate = new Date();

export const TestComponent: React.FC = () => {
  return (
    <div>
      {/* Simple text translation */}
      <h1>Welcome to Our Platform</h1>
      <p>Please read the instructions carefully</p>

      {/* Translatable attributes */}
      <img
        src="/profile.jpg"
        alt="User profile picture"
        title="Click to edit your profile picture"
      />

      <input
        type="text"
        placeholder="Enter your username"
        title="Username must be at least 3 characters"
        aria-label="Username input field"
      />

      {/* Template literals with variables */}
      <div aria-description="User information section">
        {`Hello ${user.name}, you are logged in as ${user.role}`}
      </div>

      {/* Multiple variables and nested properties */}
      <div aria-label="Notification count">
        {`You have ${user.notifications} new notifications as of ${formatDate(
          currentDate
        )}`}
      </div>

      {/* Mixed content */}
      <section>
        <h2>Account Overview</h2>
        <p>{`Last login: ${formatDate(currentDate)}`}</p>
        <div aria-description="Account status indicator">
          Account Status: Active
        </div>
      </section>

      {/* Complex template literals */}
      <p aria-label="Subscription status">
        {`Your subscription ${
          user.notifications > 0 ? 'requires' : 'does not require'
        } attention`}
      </p>

      {/* Multiple elements with translatable content */}
      <footer>
        <p>Thank you for using our service</p>
        <a
          href="/support"
          title="Get help from our support team"
          aria-label="Contact support"
        >
          Need help? Contact support
        </a>
        <div>{`© ${new Date().getFullYear()} All rights reserved`}</div>
      </footer>
    </div>
  );
};
