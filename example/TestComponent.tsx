import React from "react";

const v1 = "v1content";
const v2 = "v2content";

export const TestComponent = () => {
  return (
    <div
      className={`This should NOT be translated`}
      title={`This SHOULD be translated`}
    >
      This text should be translated too
      <span>{`This template string text should be translated too, ${v1}, and ${v2} and that's it.`}</span>
    </div>
  );
};
