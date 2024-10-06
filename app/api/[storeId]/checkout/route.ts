import Stripe from "stripe";
import { NextResponse } from "next/server";

import { stripe } from "@/lib/stripe";
import prismadb from "@/lib/prismadb";

//Add the following because if we didn't we wouldn't be allowed to create a post request because we are not in the same origin, we are in diferent application to the frontend
const corsHeaders = {
    'Access-Control-Allow-Origin' : '*',
    'Access-Control-Allow-Method': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Origin',
    'Cache-Control': 'no-store',  // Añade esto para evitar caching en Vercel
}

export async function OPTIONS() {
    return NextResponse.json({}, { headers: corsHeaders })
} 

export async function POST (
    req: Request,
    { params }: { params: { storeId: string } }
) {
    const { cartItems } = await req.json();

    if(!cartItems || cartItems.length === 0) {
        return new NextResponse("Cart items are required", { status: 400 });
    }

    const productsId =  cartItems.map((item: any) => item.id)

    const products = await prismadb.product.findMany({
        where: {
            id: {
                in: productsId
            },
        }, 
    })

    const formattedProducts = products.map((product) => (
        {
            ...product,
            quantity: Number(cartItems.find((item: any) => item.id === product.id).quantity),
        }
    ))

    const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = [];


    formattedProducts.forEach((product) => {
        line_items.push({
            quantity: product.quantity,
            price_data: {
                currency: 'USD',
                product_data: {
                    name: product.name,
                },
                unit_amount: product.price.toNumber() * 100
            }
        });
    });

    const order = await prismadb.order.create({
        data: {
            storeId: params.storeId,
            isPaid: false,
            orderItems: {
                create: cartItems.map((item: {
                    id: string,
                    size: string,
                    quantity: string
                }) => ({
                    product: {
                        connect: {
                            id: item.id,
                        },
                    },
                    size: item.size,
                    quantity: Number(item.quantity),
                }))
            }
        }
    });

    const session = await stripe.checkout.sessions.create({
        line_items,
        mode: "payment",
        billing_address_collection: "required",
        phone_number_collection: {
            enabled: true,
        },
        success_url: `${process.env.FRONTEND_STORE_URL}/cart?success=1`,
        cancel_url: `${process.env.FRONTEND_STORE_URL}/cart?cancel=1`,
        metadata: {
            orderId: order.id,
        },
    });

    return NextResponse.json({ url: session.url }, {
        headers: corsHeaders,
    });
}