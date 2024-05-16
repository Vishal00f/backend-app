// there are two methods to create async handlers this will nothing but take function as arguments and execute them 
// 1st method use promise based approach 
// 2nd method use try catch approach 
// the function must be in the format 
//next is used for middleware to pass the functionality 
// const asyncHandler = (fn)=>{(req,res,next)=>{fn(req,res,next)}};

//method 1 we use it is promise based approach 
//request handler is nothing but a function passed to execute which is async
const asyncHandler = (requestHandler) => {
    (req, res, next) => {
        Promise.resolve(requestHandler(req, res, next)).catch((err) => next(err))
    }

}

export {asyncHandler}





//method 2 which we wont use
// const asyncHandler = (requestHandler)=>async (req,res,next)=>{
//     try {
//         await requestHandler(req,res,next);
//     } catch (error) {
//         res.status(error.code || 500).json({
//             success:false,
//             message:error.message
//         })
//     }
// }