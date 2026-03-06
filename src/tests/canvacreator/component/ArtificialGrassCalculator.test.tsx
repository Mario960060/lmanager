/**
 * @vitest-environment jsdom
 */
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ArtificialGrassCalculator from "../../../components/Calculator/ArtificialGrassCalculator";
import { toPixels } from "../../../projectmanagement/canvacreator/geometry";

vi.mock("../../../lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => Promise.resolve({ data: [], error: null }),
          or: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
    }),
  },
}));
vi.mock("../../../lib/store", () => ({
  useAuthStore: (fn: (s: { getCompanyId: () => string }) => unknown) =>
    fn({ getCompanyId: () => "test-company-id" }),
}));

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

function AllProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}

function makePolygonShape() {
  return {
    points: [
      { x: 0, y: 0 },
      { x: toPixels(2), y: 0 },
      { x: toPixels(2), y: toPixels(2) },
      { x: 0, y: toPixels(2) },
    ],
    closed: true,
  };
}

describe("ArtificialGrassCalculator", () => {
  it("renders without crashing when shape is provided (canvas mode)", async () => {
    const shape = makePolygonShape();
    const { container } = render(
      <AllProviders>
        <ArtificialGrassCalculator
          isInProjectCreating={true}
          initialArea={4}
          savedInputs={{}}
          shape={shape}
          onInputsChange={() => {}}
        />
      </AllProviders>
    );
    await vi.waitFor(() => {
      expect(container).toBeInTheDocument();
    });
  });

  it("renders without crashing when shape is undefined (standalone mode)", async () => {
    const { container } = render(
      <AllProviders>
        <ArtificialGrassCalculator
          isInProjectCreating={false}
          initialArea={4}
          savedInputs={{}}
        />
      </AllProviders>
    );
    await vi.waitFor(() => {
      expect(container).toBeInTheDocument();
    });
  });

});
